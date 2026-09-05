import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logWarning, newReference, redactPath } from "@/lib/infra/http/log";

/**
 * What a log line may carry, and what it may never carry.
 *
 * A log is the one place in this product where data lands somewhere nobody set
 * an RLS policy on: a host's disk, a retention window nobody chose, readable by
 * whoever can read logs. So the rule is tested rather than trusted.
 */

afterEach(() => vi.restoreAllMocks());

function captured(write: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  write();
  expect(spy).toHaveBeenCalledTimes(1);
  const [line] = spy.mock.calls[0];
  // One argument, already serialised: a host that collects lines rather than
  // objects records "[object Object]" otherwise.
  expect(typeof line).toBe("string");
  return JSON.parse(line as string);
}

describe("a redacted path", () => {
  it("keeps the route and drops the record", () => {
    expect(redactPath("http://x/api/expenses/6f9a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c/approve")).toBe(
      "/api/expenses/[id]/approve",
    );
  });

  it("drops the query string entirely", () => {
    // It carries member filters and dates: who somebody was looking at.
    expect(redactPath("http://x/api/expenses?member=6f9a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c")).toBe(
      "/api/expenses",
    );
  });

  it("drops a date, a period and an invite token", () => {
    expect(redactPath("http://x/api/chores/2026-09-06")).toBe("/api/chores/[date]");
    expect(redactPath("http://x/api/periods/2026-09/close")).toBe("/api/periods/[period]/close");
    expect(redactPath(`http://x/join/${"t".repeat(43)}`)).toBe("/join/[token]");
  });

  it("never throws, whatever it is handed", () => {
    // A logger that can fail turns a handled error into an unhandled one, so
    // the odd shapes are asserted rather than assumed: relative, empty, junk.
    expect(() => redactPath("/api/expenses")).not.toThrow();
    expect(redactPath("")).toBe("/");
    expect(() => redactPath("::::")).not.toThrow();
  });
});

describe("a reference", () => {
  it("is eight readable characters and different every time", () => {
    const references = new Set(Array.from({ length: 200 }, newReference));
    expect(references.size).toBeGreaterThan(190);
    for (const reference of references) expect(reference).toMatch(/^[0-9a-hjkmnp-tv-z]{8}$/);
  });
});

describe("a line", () => {
  it("is one JSON object with a level, a time and the shape of the failure", () => {
    const line = captured(() =>
      logError({
        code: "INTERNAL",
        reference: "abcd1234",
        route: "/api/expenses/[id]",
        method: "PATCH",
        status: 500,
        sqlstate: "23505",
        message: "duplicate key value violates unique constraint",
      }),
    );

    expect(line.level).toBe("error");
    expect(line.event).toBe("app.error");
    expect(line.code).toBe("INTERNAL");
    expect(line.reference).toBe("abcd1234");
    expect(line.sqlstate).toBe("23505");
    expect(String(line.ts)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("carries no id, because the caller redacted the path before it got here", () => {
    const line = captured(() =>
      logError({ code: "INTERNAL", reference: "abcd1234", route: "/api/expenses/[id]" }),
    );
    expect(JSON.stringify(line)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });

  it("has a warning level for a failure the app absorbed", () => {
    const line = captured(() => logWarning({ code: "RATE_LIMIT_UNREACHABLE", route: "proxy" }));
    expect(line.level).toBe("warn");
    expect(line.event).toBe("app.warning");
    // No reference: nobody is going to quote a warning back at anybody.
    expect(line.reference).toBeUndefined();
  });
});
