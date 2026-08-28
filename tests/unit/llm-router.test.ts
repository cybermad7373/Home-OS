import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  isCapabilityOn,
} from "@/lib/domain/llm/capabilities";

/**
 * The router — docs/10-LLM-SPEC.md sections 1 and 3.6a.
 *
 * `route` is `resolveLlm` plus one check: the Home's capability switch for this
 * call site. It exists so that there is exactly one place that can answer
 * "should this Home make this call", which is what makes AI-02 enforceable
 * rather than aspirational.
 *
 * The important test in this file is the source scan. **A call site that
 * imports `resolveLlm` directly has bypassed the capability switch**, and that
 * is invisible at runtime — the feature works, the switch simply does nothing.
 * Section 10's test table names it for that reason: asserted by a source scan,
 * because a bypass cannot be caught by running the code.
 */

const ROOT = join(__dirname, "..", "..");

/** Everything that is allowed to know `resolveLlm` exists. */
const PERMITTED = new Set([
  join("lib", "infra", "llm", "resolve.ts"),
  join("lib", "infra", "llm", "router.ts"),
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("no call site bypasses the router", () => {
  it("nothing outside lib/infra/llm imports resolveLlm", () => {
    const offenders: string[] = [];

    for (const dir of ["app", "lib", "components"]) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const relative = file.slice(ROOT.length + 1);
        if (PERMITTED.has(relative)) continue;
        if (/\bresolveLlm\b/.test(readFileSync(file, "utf8"))) offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("the capability list", () => {
  it("has one entry per call site, and a line of copy for each", () => {
    expect(CAPABILITIES).toEqual([
      "schedule_proposals",
      "weekly_summary",
      "natural_language",
      "rule_parsing",
      "food_ideas",
      "food_normalise",
    ]);

    for (const capability of CAPABILITIES) {
      expect(CAPABILITY_LABEL[capability]).toBeTruthy();
    }
  });

  it("matches the keys the database constraint permits", () => {
    const migration = readFileSync(
      join(ROOT, "supabase", "migrations", "20260828090066_home_rules.sql"),
      "utf8",
    );

    for (const capability of CAPABILITIES) {
      expect(migration).toContain(`'${capability}'`);
    }
  });
});

describe("a switch that is off", () => {
  it("behaves exactly as if no key were configured, for that call site alone", () => {
    const capabilities = { rule_parsing: false, food_ideas: true };

    expect(isCapabilityOn(capabilities, "rule_parsing")).toBe(false);
    expect(isCapabilityOn(capabilities, "food_ideas")).toBe(true);
    // A call site the Home never expressed a view about stays on: a new
    // feature defaulting to off would make the panel a thing every Home has to
    // visit after every release.
    expect(isCapabilityOn(capabilities, "weekly_summary")).toBe(true);
  });

  it("treats no credential row as all six on, which is the environment fallback", () => {
    for (const capability of CAPABILITIES) {
      expect(isCapabilityOn(null, capability)).toBe(true);
    }
  });
});
