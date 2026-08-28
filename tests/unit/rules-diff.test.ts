import { describe, expect, it } from "vitest";
import {
  describeAction,
  describeAppliesTo,
  describeCondition,
  diffVersions,
  rupees,
  type RuleSnapshot,
} from "@/lib/domain/rules/diff";

/**
 * RL-07 — the history has to answer, for every version: who changed it, when,
 * **from what, to what**, why, and who acknowledged it. Four of those six come
 * straight off the row. This file is the fifth.
 */

function version(overrides: Partial<RuleSnapshot> = {}): RuleSnapshot {
  return {
    versionNo: 1,
    title: "Clean dishes after eating",
    originalText: "Everyone should clean their own plates before sleeping.",
    condition: { kind: "time_of_day", after: "dinner" },
    action: { kind: "task", text: "Clean own dishes" },
    appliesTo: { kind: "all" },
    weightPoints: null,
    penaltyPaise: null,
    startsOn: "2026-06-04",
    endsOn: null,
    ...overrides,
  };
}

describe("version 1", () => {
  it("is the rule rather than a change to one, so it lists nothing", () => {
    expect(diffVersions(null, version())).toEqual([]);
  });
});

describe("an edit", () => {
  it("names only the fields that moved", () => {
    const changes = diffVersions(
      version(),
      version({ versionNo: 2, penaltyPaise: 5000 }),
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("penalty_paise");
    expect(changes[0].before).toBeNull();
    expect(changes[0].after).toBe("₹50");
  });

  it("reads the structured halves as sentences, not as jsonb", () => {
    const changes = diffVersions(
      version(),
      version({
        versionNo: 2,
        condition: { kind: "chore_missed", template: "Clean bathroom" },
        appliesTo: { kind: "assignee" },
      }),
    );

    const byField = new Map(changes.map((change) => [change.field, change]));

    expect(byField.get("condition")?.before).toBe("After dinner");
    expect(byField.get("condition")?.after).toBe("Clean bathroom is missed");
    expect(byField.get("applies_to")?.before).toBe("Everyone");
    expect(byField.get("applies_to")?.after).toBe("Whoever it was assigned to");
  });

  it("shows the original text changing, because that is what the Home agreed to", () => {
    const changes = diffVersions(
      version(),
      version({ versionNo: 2, originalText: "Wash your plate before bed." }),
    );

    expect(changes.map((change) => change.field)).toContain("original_text");
  });

  it("records a disable as an end date arriving", () => {
    const changes = diffVersions(
      version(),
      version({ versionNo: 2, endsOn: "2026-07-20" }),
    );

    expect(changes).toEqual([
      { field: "ends_on", label: "Until", before: null, after: "2026-07-20" },
    ]);
  });

  it("says nothing when nothing moved", () => {
    expect(diffVersions(version(), version({ versionNo: 2 }))).toEqual([]);
  });
});

describe("the sentences", () => {
  it("describes every condition kind without falling through", () => {
    expect(describeCondition(version({ condition: { kind: "chore_missed" } }))).toBe(
      "A chore is missed",
    );
    expect(
      describeCondition(
        version({ condition: { kind: "state_at_time", state: "unwashed vessels", at: "end of day" } }),
      ),
    ).toBe("unwashed vessels at end of day");
    expect(describeCondition(version({ condition: { kind: "guest_present" } }))).toBe(
      "A guest is staying",
    );
    expect(
      describeCondition(
        version({ condition: { kind: "spend_exceeds", amountPaise: 250000 } }),
      ),
    ).toBe("Spending goes over ₹2,500");
    expect(
      describeCondition(version({ condition: { kind: "other", description: "Anything" } })),
    ).toBe("Anything");
  });

  it("describes every action kind, reading the numbers off the rule", () => {
    expect(describeAction(version({ action: { kind: "reschedule" } }))).toBe(
      "The missed job is rescheduled",
    );
    expect(
      describeAction(version({ action: { kind: "points_penalty" }, weightPoints: 5 })),
    ).toBe("5 points off");
    expect(
      describeAction(version({ action: { kind: "money_penalty" }, penaltyPaise: 20000 })),
    ).toBe("₹200 penalty");
    expect(describeAction(version({ action: { kind: "notify" } }))).toBe("The house is told");
  });

  it("counts named people rather than naming them", () => {
    expect(
      describeAppliesTo(
        version({ appliesTo: { kind: "named_members", memberIds: ["a", "b"] } }),
      ),
    ).toBe("2 named people");
    expect(describeAppliesTo(version({ appliesTo: { kind: "room", value: "R2" } }))).toBe(
      "Room R2",
    );
  });
});

describe("money at the boundary", () => {
  it("converts paise to rupees only for display, and keeps the paise", () => {
    expect(rupees(0)).toBe("₹0");
    expect(rupees(5000)).toBe("₹50");
    expect(rupees(5050)).toBe("₹50.50");
    expect(rupees(5005)).toBe("₹50.05");
    expect(rupees(1000000)).toBe("₹10,000");
    expect(rupees(null)).toBeNull();
  });
});
