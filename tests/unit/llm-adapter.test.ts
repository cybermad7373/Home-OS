import { describe, expect, it, vi } from "vitest";
import { createProvider, type LlmRunRecord } from "@/lib/infra/llm/adapter";
import { getProvider } from "@/lib/infra/llm/providers";
import { extractJson, validateAgainstSchema } from "@/lib/infra/llm/schema";
import type { JsonSchema, Transport, TransportResult } from "@/lib/infra/llm/types";
import {
  FAILURE_THRESHOLD,
  isBreakerOpen,
  recordFailure,
  recordSuccess,
  resetBreakers,
} from "@/lib/infra/llm/breaker";

/**
 * The adapter's seven guarantees — docs/10-LLM-SPEC.md section 1, and the
 * round-trip rows of the section 10 table.
 *
 * Every test here uses a stub transport, so nothing reaches a network and the
 * suite passes with no key anywhere, which is the phase's own gate.
 */

const SCHEMA: JsonSchema = {
  type: "object",
  required: ["answer"],
  additionalProperties: false,
  properties: { answer: { type: "string", maxLength: 20 } },
};

const REQUEST = {
  purpose: "digest" as const,
  system: "be brief",
  user: JSON.stringify({ members: [{ id: "m1", name: "Ravi" }] }),
  schema: SCHEMA,
  maxTokens: 100,
  temperature: 0.2,
};

function stub(...results: TransportResult[]): { transport: Transport; calls: () => number } {
  let index = 0;
  return {
    transport: async () => results[Math.min(index++, results.length - 1)],
    calls: () => index,
  };
}

function build(transport: Transport, onRun?: (record: LlmRunRecord) => void) {
  return createProvider({
    descriptor: getProvider("groq")!,
    apiKey: "gsk_a_secret_key_nobody_should_see",
    transport,
    sleep: async () => undefined,
    onRun,
  });
}

describe("a good answer", () => {
  it("is parsed, validated and returned", async () => {
    const { transport } = stub({ status: 200, text: '{"answer":"done"}' });
    const result = await build(transport).complete<{ answer: string }>(REQUEST);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ answer: "done" });
  });

  it("is found inside prose, when the provider has no JSON mode", async () => {
    const { transport } = stub({
      status: 200,
      text: 'Sure! Here you go:\n```json\n{"answer":"done"}\n```',
    });
    const result = await build(transport).complete<{ answer: string }>(REQUEST);
    expect(result.data).toEqual({ answer: "done" });
  });
});

describe("a bad answer", () => {
  it("is a failure rather than a throw, when it is not JSON at all", async () => {
    const { transport } = stub({ status: 200, text: "I would rather not." });
    const result = await build(transport).complete(REQUEST);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("the response was not JSON");
  });

  it("is a failure when it does not match the schema", async () => {
    const { transport } = stub({ status: 200, text: '{"answer":123}' });
    const result = await build(transport).complete(REQUEST);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("expected a string");
  });

  it("is not retried — the same prompt gives the same shape", async () => {
    const { transport, calls } = stub({ status: 200, text: "not json" });
    await build(transport).complete(REQUEST);
    expect(calls()).toBe(1);
  });
});

describe("failures on the wire", () => {
  it("retries exactly once on a 5xx", async () => {
    const { transport, calls } = stub(
      { status: 500, error: "upstream is unwell" },
      { status: 200, text: '{"answer":"done"}' },
    );
    const result = await build(transport).complete<{ answer: string }>(REQUEST);

    expect(calls()).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("gives up after the second 5xx rather than looping", async () => {
    const { transport, calls } = stub({ status: 503, error: "still unwell" });
    const result = await build(transport).complete(REQUEST);

    expect(calls()).toBe(2);
    expect(result.ok).toBe(false);
  });

  it("does not retry a rejected key", async () => {
    const { transport, calls } = stub({ status: 401, error: "invalid api key" });
    await build(transport).complete(REQUEST);
    expect(calls()).toBe(1);
  });

  it("never throws, even when the transport does", async () => {
    const throwing: Transport = async () => {
      throw new Error("socket closed");
    };
    const result = await build(throwing).complete(REQUEST);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("socket closed");
  });

  it("reports a timeout without retrying it", async () => {
    const aborting: Transport = async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    };
    const result = await build(aborting).complete(REQUEST);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("timed out");
  });
});

describe("logging", () => {
  it("writes a run for a success and for a failure alike", async () => {
    const records: LlmRunRecord[] = [];
    const push = (record: LlmRunRecord) => void records.push(record);

    await build(stub({ status: 200, text: '{"answer":"done"}' }).transport, push).complete(REQUEST);
    await build(stub({ status: 500, error: "unwell" }).transport, push).complete(REQUEST);

    expect(records).toHaveLength(2);
    expect(records[0].accepted).toBe(true);
    expect(records[1].accepted).toBe(false);
    expect(records[1].error).toBe("unwell");
  });

  it("never records the key, in any field", async () => {
    const records: LlmRunRecord[] = [];
    await build(stub({ status: 401, error: "invalid api key gsk_…" }).transport, (record) =>
      void records.push(record),
    ).complete(REQUEST);

    expect(JSON.stringify(records)).not.toContain("gsk_a_secret_key_nobody_should_see");
  });

  it("does not fail the call when the log write fails", async () => {
    const result = await build(stub({ status: 200, text: '{"answer":"done"}' }).transport, () => {
      throw new Error("the database is down");
    }).complete(REQUEST);

    expect(result.ok).toBe(true);
  });
});

describe("the circuit breaker", () => {
  it("opens after three consecutive failures and closes on a success", () => {
    resetBreakers();
    const house = "house-1";

    for (let i = 1; i < FAILURE_THRESHOLD; i += 1) {
      expect(recordFailure(house)).toBe(false);
      expect(isBreakerOpen(house)).toBe(false);
    }

    expect(recordFailure(house)).toBe(true);
    expect(isBreakerOpen(house)).toBe(true);

    recordSuccess(house);
    expect(isBreakerOpen(house)).toBe(false);
  });

  it("stays open for an hour", () => {
    resetBreakers();
    const at = Date.parse("2026-08-26T10:00:00Z");
    for (let i = 0; i < FAILURE_THRESHOLD; i += 1) recordFailure("house-2", at);

    expect(isBreakerOpen("house-2", at + 59 * 60 * 1000)).toBe(true);
    expect(isBreakerOpen("house-2", at + 61 * 60 * 1000)).toBe(false);
  });
});

describe("JSON extraction", () => {
  it("ignores braces inside string literals", () => {
    expect(extractJson('{"chore":"Clean {the} bathroom"}')).toBe(
      '{"chore":"Clean {the} bathroom"}',
    );
  });

  it("ignores an escaped quote", () => {
    expect(extractJson('{"note":"she said \\"no\\""}')).toBe('{"note":"she said \\"no\\""}');
  });

  it("returns null when there is no balanced block", () => {
    expect(extractJson('{"answer":')).toBeNull();
  });
});

describe("the schema validator", () => {
  it("collects every failure rather than the first", () => {
    const schema: JsonSchema = {
      type: "object",
      required: ["a", "b"],
      properties: { a: { type: "number", minimum: 0 }, b: { type: "string" } },
    };
    expect(validateAgainstSchema({ a: -1 }, schema)).toEqual([
      "$: missing b",
      "$.a: below 0",
    ]);
  });

  it("checks an enum, a date format and an array's ceiling", () => {
    expect(
      validateAgainstSchema("maybe", { enum: ["yes", "no"] }),
    ).toEqual(["$: not one of yes, no"]);

    expect(
      validateAgainstSchema("26-08-2026", { type: "string", format: "date" }),
    ).toEqual(["$: not an ISO date"]);

    expect(
      validateAgainstSchema([1, 2, 3, 4], { type: "array", maxItems: 3, items: { type: "number" } }),
    ).toEqual(["$: more than 3 items"]);
  });
});

describe("a provider with no base URL", () => {
  it("fails cleanly rather than fetching an empty string", async () => {
    const provider = createProvider({
      descriptor: getProvider("custom")!,
      apiKey: "",
      transport: vi.fn(),
    });
    const result = await provider.complete(REQUEST);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no base URL");
  });
});
