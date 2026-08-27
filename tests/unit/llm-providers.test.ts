import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  getProvider,
  publicRegistry,
  resolveBaseUrl,
  resolveModel,
} from "@/lib/infra/llm/providers";
import { transportFor } from "@/lib/infra/llm/adapter";

/**
 * Registry integrity — docs/10-LLM-SPEC.md section 10.
 *
 * The registry is data, and adding a provider is meant to be one row and one
 * line in a check constraint. This is the test that makes that claim safe: a
 * row with a typo in its transport, or a default model absent from its own
 * list, fails here rather than at nine o'clock on a Sunday when the schedule
 * generates.
 */

const CONSTRAINT_IDS = [
  "gemini",
  "groq",
  "openrouter",
  "huggingface",
  "cerebras",
  "mistral",
  "openai",
  "anthropic",
  "custom",
];

describe("the provider registry", () => {
  it("ships every provider the database's check constraint allows", () => {
    expect(PROVIDERS.map((provider) => provider.id).sort()).toEqual([...CONSTRAINT_IDS].sort());
  });

  it("gives every descriptor a transport that exists", () => {
    for (const provider of PROVIDERS) {
      expect(transportFor(provider.transport), provider.id).toBeDefined();
    }
  });

  it("gives every descriptor a well-formed base URL", () => {
    for (const provider of PROVIDERS) {
      if (provider.requiresBaseUrl) {
        // `custom` supplies its own, so an empty one here is the point.
        expect(provider.baseUrl, provider.id).toBe("");
        continue;
      }
      expect(() => new URL(provider.baseUrl), provider.id).not.toThrow();
      expect(provider.baseUrl.startsWith("https://"), provider.id).toBe(true);
    }
  });

  it("gives every descriptor a default model present in its own list", () => {
    for (const provider of PROVIDERS) {
      if (provider.requiresBaseUrl) continue;
      expect(
        provider.models.map((model) => model.id),
        provider.id,
      ).toContain(provider.defaultModel);
    }
  });

  it("gives every descriptor a key hint that compiles", () => {
    for (const provider of PROVIDERS) {
      expect(() => new RegExp(provider.keyHint.pattern), provider.id).not.toThrow();
    }
  });

  it("orders the free tiers first, which is what the picker renders", () => {
    const firstPaid = PROVIDERS.findIndex(
      (provider) => provider.models.length > 0 && !provider.models.some((model) => model.free),
    );
    const lastFree = PROVIDERS.map((provider) =>
      provider.models.some((model) => model.free),
    ).lastIndexOf(true);
    expect(firstPaid).toBeGreaterThan(lastFree);
  });
});

describe("resolution", () => {
  it("accepts a typed model id, because catalogues change faster than this repo", () => {
    const groq = getProvider("groq")!;
    expect(resolveModel(groq, "some-model-shipped-last-tuesday")).toBe(
      "some-model-shipped-last-tuesday",
    );
    expect(resolveModel(groq, "  ")).toBe(groq.defaultModel);
  });

  it("trims a trailing slash off a self-hosted URL", () => {
    const custom = getProvider("custom")!;
    expect(resolveBaseUrl(custom, "http://localhost:11434/v1/")).toBe(
      "http://localhost:11434/v1",
    );
  });

  it("gives the picker no field that could ever hold a key", () => {
    for (const entry of publicRegistry()) {
      const fields = Object.keys(entry);
      expect(fields).not.toContain("api_key");
      expect(fields).not.toContain("apiKey");
      expect(fields).not.toContain("key");
    }
    // `key_hint` is a pattern and an example placeholder — never a real key.
    for (const entry of publicRegistry()) {
      expect(entry.key_hint.example.length).toBeLessThanOrEqual(32);
    }
  });
});
