import { describe, expect, it } from "vitest";
import {
  RULE_PARSE_RESPONSE_SCHEMA,
  buildRuleParsePayload,
  normaliseRuleParse,
  type RuleParseContext,
} from "@/lib/domain/rules/parse";
import { findForbidden } from "@/lib/infra/llm/redact";
import {
  RULE_PARSE_CAP_PER_DAY,
  countHouseCall,
  houseCallsUsed,
  resetParseCounts,
  underHouseCap,
} from "@/lib/infra/llm/rate";

/**
 * Call site 4 — docs/10-LLM-SPEC.md section 8.4.
 *
 * The rule this file exists to hold: **nothing the model says becomes money
 * unless the Admin's own text contains a number.** Every other check here turns
 * a bad answer into a form field somebody fixes, which is a nuisance. A
 * hallucinated ₹50 that an Admin skims past and the Home acknowledges is not a
 * nuisance, so it is the one that is tested from several directions.
 */

const ctx: RuleParseContext = {
  choreTemplates: ["Cook dinner", "Clean kitchen", "Clean bathroom"],
  roles: ["admin", "co_admin", "member"],
  rooms: ["R1", "R2"],
};

describe("the payload", () => {
  it("carries the Admin's text verbatim and the closed vocabularies", () => {
    const payload = buildRuleParsePayload(
      "  Nobody leaves unwashed vessels overnight.  ",
      ctx,
    );

    expect(payload.text).toBe("Nobody leaves unwashed vessels overnight.");
    expect(payload.condition_kinds).toContain("state_at_time");
    expect(payload.action_kinds).toContain("reschedule");
    expect(payload.applies_to_kinds).toContain("responsible_person");
    expect(payload.chore_templates).toEqual(ctx.choreTemplates);
  });

  it("sends room labels, never room names or ids", () => {
    const payload = buildRuleParsePayload("Keep the balcony clear", ctx);

    expect(payload.rooms).toEqual(["R1", "R2"]);
    expect(findForbidden(payload)).toEqual([]);
  });
});

describe("the worked examples from the specification", () => {
  it("keeps a plate-washing rule as a task that applies to everyone", () => {
    const { proposal, flags } = normaliseRuleParse(
      {
        title: "Clean your own plates",
        confidence: 0.9,
        condition: { kind: "time_of_day", after: "dinner" },
        action: { kind: "task", text: "Clean own dishes" },
        applies_to: { kind: "all" },
      },
      ctx,
      "Everyone should clean their own plates before sleeping.",
    );

    expect(proposal.condition).toEqual({ kind: "time_of_day", after: "dinner" });
    expect(proposal.action).toEqual({ kind: "task", text: "Clean own dishes" });
    expect(proposal.appliesTo).toEqual({ kind: "all" });
    expect(proposal.weightPoints).toBeNull();
    expect(proposal.penaltyPaise).toBeNull();
    expect(flags).toEqual([]);
  });

  it("keeps a chore_missed → reschedule pair, which is one of the two executed kinds", () => {
    const { proposal } = normaliseRuleParse(
      {
        title: "Missed bathroom cleaning reschedules",
        confidence: 0.88,
        condition: { kind: "chore_missed", template: "Clean bathroom" },
        action: { kind: "reschedule" },
        applies_to: { kind: "assignee" },
      },
      ctx,
      "If someone does not clean the bathroom on their assigned day, the missed task should be rescheduled.",
    );

    expect(proposal.condition.kind).toBe("chore_missed");
    expect(proposal.condition.template).toBe("Clean bathroom");
    expect(proposal.action.kind).toBe("reschedule");
  });
});

describe("the invented-penalty rule", () => {
  it("strips a penalty the source text never mentioned", () => {
    const { proposal, flags } = normaliseRuleParse(
      {
        title: "Wash up before bed",
        confidence: 0.8,
        condition: { kind: "state_at_time", state: "unwashed_vessels", at: "end_of_day" },
        action: { kind: "money_penalty" },
        applies_to: { kind: "responsible_person" },
        penalty_paise: 5000,
      },
      ctx,
      "Nobody should leave unwashed vessels overnight.",
    );

    expect(proposal.penaltyPaise).toBeNull();
    expect(flags).toContain("penalty_stripped");
  });

  it("strips an invented points weight for the same reason", () => {
    const { proposal } = normaliseRuleParse(
      {
        title: "Keep the kitchen clean",
        confidence: 0.7,
        condition: { kind: "other" },
        action: { kind: "points_penalty" },
        applies_to: { kind: "all" },
        weight_points: 10,
      },
      ctx,
      "Whoever cooks cleans the kitchen after.",
    );

    expect(proposal.weightPoints).toBeNull();
  });

  it("keeps a penalty the Admin actually typed", () => {
    const { proposal, flags } = normaliseRuleParse(
      {
        title: "Loud music after 11",
        confidence: 0.9,
        condition: { kind: "time_of_day", after: "23:00" },
        action: { kind: "money_penalty" },
        applies_to: { kind: "all" },
        penalty_paise: 20000,
      },
      ctx,
      "No loud music after 11 PM on weekdays, ₹200 if you do.",
    );

    expect(proposal.penaltyPaise).toBe(20000);
    expect(flags).not.toContain("penalty_stripped");
  });

  it("refuses a number outside the range the schema and the constraint agree on", () => {
    const { proposal } = normaliseRuleParse(
      {
        title: "Absurd penalty",
        confidence: 0.9,
        condition: { kind: "other" },
        action: { kind: "money_penalty" },
        applies_to: { kind: "all" },
        penalty_paise: 900_000_000,
        weight_points: 4000,
      },
      ctx,
      "A fine of 9000000 rupees for leaving the light on.",
    );

    expect(proposal.penaltyPaise).toBeNull();
    expect(proposal.weightPoints).toBeNull();
  });
});

describe("coercion, which never fails", () => {
  it("turns an unrecognised condition kind into `other` and keeps the words", () => {
    const { proposal } = normaliseRuleParse(
      {
        title: "Shoes off",
        confidence: 0.6,
        condition: { kind: "vibe_check", description: "when anyone comes in" },
        action: { kind: "task", text: "Take shoes off at the door" },
        applies_to: { kind: "all" },
      },
      ctx,
      "Everyone takes their shoes off at the door.",
    );

    expect(proposal.condition.kind).toBe("other");
    expect(proposal.condition.description).toBe("when anyone comes in");
  });

  it("falls back to `all` for an unrecognised audience, and flags it", () => {
    const { proposal, flags } = normaliseRuleParse(
      {
        title: "Bins",
        confidence: 0.5,
        condition: { kind: "time_of_day", after: "20:00" },
        action: { kind: "task", text: "Take the bins out" },
        applies_to: { kind: "whoever_is_nearest" },
      },
      ctx,
      "Someone should take the bins out in the evening.",
    );

    expect(proposal.appliesTo.kind).toBe("all");
    expect(flags).toContain("applies_to");
  });

  it("drops a template the Home does not have, and keeps the condition kind", () => {
    const { proposal, flags } = normaliseRuleParse(
      {
        title: "Missed laundry",
        confidence: 0.7,
        condition: { kind: "chore_missed", template: "Do the laundry" },
        action: { kind: "reschedule" },
        applies_to: { kind: "assignee" },
      },
      ctx,
      "A missed laundry day gets rescheduled.",
    );

    expect(proposal.condition.kind).toBe("chore_missed");
    expect(proposal.condition.template).toBeUndefined();
    expect(flags).toContain("template_dropped");
  });

  it("survives a response with nothing usable in it at all", () => {
    const { proposal, confidence } = normaliseRuleParse(
      {},
      ctx,
      "Keep the fridge tidy please",
    );

    expect(proposal.condition.kind).toBe("other");
    expect(proposal.action.kind).toBe("other");
    expect(proposal.appliesTo.kind).toBe("all");
    expect(proposal.title).toBe("Keep the fridge tidy please");
    expect(confidence).toBe(0);
  });

  it("never invents dates", () => {
    const { proposal } = normaliseRuleParse(
      {
        title: "Sunday bathroom",
        confidence: 0.9,
        condition: { kind: "time_of_day", after: "Sunday" },
        action: { kind: "task", text: "Clean the bathroom" },
        applies_to: { kind: "all" },
      },
      ctx,
      "The bathroom is cleaned every Sunday from 1 September.",
    );

    expect(proposal.startsOn).toBeNull();
    expect(proposal.endsOn).toBeNull();
  });
});

describe("the original text", () => {
  it("is kept verbatim on the proposal, whatever the model returned (RL-09)", () => {
    const text = "Nobody should leave unwashed vessels overnight.";
    const { proposal } = normaliseRuleParse(
      {
        title: "Something else entirely",
        confidence: 0.4,
        condition: { kind: "other" },
        action: { kind: "other" },
        applies_to: { kind: "all" },
      },
      ctx,
      text,
    );

    expect(proposal.originalText).toBe(text);
  });
});

describe("the response schema", () => {
  it("requires the four fields the form cannot be built without", () => {
    expect(RULE_PARSE_RESPONSE_SCHEMA.required).toEqual([
      "title",
      "condition",
      "action",
      "applies_to",
      "confidence",
    ]);
  });
});

describe("the per-Home cap", () => {
  it("counts by Home rather than by member", () => {
    resetParseCounts();

    for (let call = 0; call < RULE_PARSE_CAP_PER_DAY; call += 1) {
      expect(underHouseCap("house-1", "rule_parse", "2026-08-28", RULE_PARSE_CAP_PER_DAY)).toBe(
        true,
      );
      countHouseCall("house-1", "rule_parse", "2026-08-28");
    }

    expect(underHouseCap("house-1", "rule_parse", "2026-08-28", RULE_PARSE_CAP_PER_DAY)).toBe(
      false,
    );
    // A second Home is unaffected, and so is tomorrow.
    expect(underHouseCap("house-2", "rule_parse", "2026-08-28", RULE_PARSE_CAP_PER_DAY)).toBe(
      true,
    );
    expect(houseCallsUsed("house-1", "rule_parse", "2026-08-29")).toBe(0);
  });
});
