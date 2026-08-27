import { describe, expect, it } from "vitest";
import {
  buildDigestPayload,
  buildTemplateDigest,
  completionRate,
  top3Share,
  validateDigest,
  type DigestInput,
  type DigestResponse,
} from "@/lib/domain/llm/digest";
import { findForbidden } from "@/lib/infra/llm/redact";

/**
 * Call site 2 — docs/10-LLM-SPEC.md section 6.
 *
 * A digest cannot corrupt state, so its validation is lighter than the
 * schedule's. What it does catch is the two ways a summary lies: a name nobody
 * in the house has, and a number nobody earned.
 */

const input: DigestInput = {
  weekStart: "2026-08-17",
  weekEnd: "2026-08-23",
  members: [
    {
      memberId: "uuid-ravi",
      displayName: "Ravi Kumar",
      earned: 128,
      target: 105,
      done: 6,
      missed: 0,
      lastWeekEarned: 110,
    },
    {
      memberId: "uuid-vinoth",
      displayName: "Vinoth Raj",
      earned: 98,
      target: 105,
      done: 4,
      missed: 1,
      lastWeekEarned: 60,
    },
    {
      memberId: "uuid-suresh",
      displayName: "Suresh Babu",
      earned: 20,
      target: 105,
      done: 1,
      missed: 4,
      lastWeekEarned: 5,
    },
  ],
  nextWeek: [
    { memberId: "uuid-suresh", newTarget: 157, note: "target raised by the carried deficit" },
  ],
  lastWeekTop3Share: 0.68,
};

function answer(overrides: Partial<DigestResponse> = {}): DigestResponse {
  return {
    summary:
      "Ravi earned 128 points against a target of 105 and Vinoth 98, while Suresh earned 20 of his 105 and missed 4 chores. Next week Suresh owes 157.",
    highlights: { carried: ["Ravi"], coasted: ["Suresh"], improved: ["Vinoth"] },
    next_week_note: "Suresh's target rises to 157 points.",
    ...overrides,
  };
}

describe("the numbers", () => {
  it("computes the concentration ratio and the completion rate", () => {
    expect(top3Share(input.members)).toBe(1);
    expect(completionRate(input.members)).toBe(0.69);
  });
});

describe("validation", () => {
  it("accepts a summary built from names and numbers that were supplied", () => {
    expect(validateDigest(answer(), input)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a hallucinated name", () => {
    const result = validateDigest(
      answer({ highlights: { carried: ["Priya"], coasted: [], improved: [] } }),
      input,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("UNKNOWN_NAME:carried:Priya");
  });

  it("rejects an invented statistic", () => {
    const result = validateDigest(
      answer({
        summary:
          "Ravi earned 128 points and Vinoth 98, while Suresh earned 20 of his 105. The house is 42 per cent short of where it was in 2019.",
      }),
      input,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("INVENTED_NUMBER:2019");
  });

  it("rejects a summary too short to be a summary", () => {
    const result = validateDigest(answer({ summary: "Everyone did fine." }), input);
    expect(result.errors.some((error) => error.startsWith("SUMMARY_TOO_SHORT"))).toBe(true);
  });
});

describe("the deterministic digest", () => {
  it("says who carried the week, who is behind, and what changes", () => {
    const template = buildTemplateDigest(input);

    expect(template.summary).toContain("69%");
    expect(template.summary).toContain("Ravi (128 pts)");
    // Three members, so the top three are the whole house: the ratio is 100%,
    // which is up from last week's 68% and says so.
    expect(template.summary).toContain("up from 68% last week");
    expect(template.summary).toContain("Suresh earned 20 of a 105 target");
    expect(template.next_week_note).toContain("157");
  });

  it("passes its own validator, which is what makes it a safe fallback", () => {
    // The template is what goes out when the model's version is rejected, so a
    // template that would itself be rejected is a defect.
    expect(validateDigest(buildTemplateDigest(input), input).valid).toBe(true);
  });

  it("says something sensible for a house with no data at all", () => {
    const empty = buildTemplateDigest({ ...input, members: [], nextWeek: [] });
    expect(empty.summary).toContain("0%");
    expect(empty.highlights.carried).toEqual([]);
  });
});

describe("the payload", () => {
  it("carries first names, points and counts — and no identifier", () => {
    const payload = buildDigestPayload(input);
    expect(findForbidden(payload)).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("uuid-ravi");
    expect(JSON.stringify(payload)).not.toContain("Kumar");
  });
});
