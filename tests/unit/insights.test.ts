import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  bucketKeyOf,
  bucketsBetween,
  buildChoreInsights,
  buildFinancialPosition,
  buildFoodInsights,
  buildHomeInsights,
  buildMoneyInsights,
  changePct,
  earnedComponents,
  explainPoints,
  weekStartOf,
  type ChoreAssignment,
  type InsightRange,
  type MealRecord,
  type MoneyExpense,
} from "@/lib/domain/insights";
import { computeBalances } from "@/lib/domain/settlement/netting";

/**
 * Phase 15's pure layer — docs/07-ROADMAP.md phase 15, IN-01 to IN-10.
 *
 * Everything here is a function of its inputs, so every acceptance criterion
 * that is really an arithmetic claim is asserted here rather than clicked
 * through in a browser.
 */

const AUGUST: InsightRange = { from: "2026-08-01", to: "2026-08-31", granularity: "week" };

describe("bucketing", () => {
  it("starts a week on Monday, matching the effort ledger", () => {
    // 2026-08-29 is a Saturday; its ISO week began Monday the 24th.
    expect(weekStartOf("2026-08-29")).toBe("2026-08-24");
    expect(weekStartOf("2026-08-24")).toBe("2026-08-24");
    // A Sunday belongs to the week that started six days earlier, not the next.
    expect(weekStartOf("2026-08-30")).toBe("2026-08-24");
  });

  it("keys a month bucket as the period, so it reads like one", () => {
    expect(bucketKeyOf("2026-08-29", "month")).toBe("2026-08");
    expect(bucketKeyOf("2026-08-29", "day")).toBe("2026-08-29");
  });

  it("walks forwards and terminates", () => {
    expect(bucketsBetween("2026-08-01", "2026-08-04", "day")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
    expect(bucketsBetween("2026-06-15", "2026-08-15", "month")).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("leaves no gap where the house recorded nothing", () => {
    // A quiet week still gets a bucket: a missing bar reads as a shorter month.
    expect(bucketsBetween("2026-08-01", "2026-08-31", "week")).toHaveLength(6);
  });

  it("returns nothing for an inverted or empty range", () => {
    expect(bucketsBetween("2026-08-31", "2026-08-01", "day")).toEqual([]);
    expect(bucketsBetween("", "2026-08-01", "day")).toEqual([]);
  });

  it("never runs away, whatever range it is handed", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2000-01-01"), max: new Date("2050-01-01"), noInvalidDate: true }),
        fc.date({ min: new Date("2000-01-01"), max: new Date("2050-01-01"), noInvalidDate: true }),
        fc.constantFrom("day" as const, "week" as const, "month" as const),
        (from, to, granularity) => {
          const keys = bucketsBetween(
            from.toISOString().slice(0, 10),
            to.toISOString().slice(0, 10),
            granularity,
          );
          expect(keys.length).toBeLessThanOrEqual(400);
          // Strictly ascending, so a chart never draws the same bar twice.
          for (let i = 1; i < keys.length; i += 1) expect(keys[i] > keys[i - 1]).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("reports no change against a bucket that does not exist", () => {
    expect(changePct(500, 0)).toBeNull();
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(50, 100)).toBe(-50);
  });
});

function expense(overrides: Partial<MoneyExpense> = {}): MoneyExpense {
  return {
    expenseId: "e1",
    date: "2026-08-10",
    amountPaise: 10_000,
    categoryId: "cat-groceries",
    categoryName: "Groceries",
    paidByMemberId: "m1",
    paidByName: "Asha",
    approved: true,
    ...overrides,
  };
}

const MEMBERS = [
  { memberId: "m1", displayName: "Asha", active: true },
  { memberId: "m2", displayName: "Bala", active: true },
];

describe("buildMoneyInsights", () => {
  it("counts only approved spending, and reports what is still waiting", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: false,
      expenses: [
        expense({ expenseId: "e1", amountPaise: 30_000 }),
        expense({ expenseId: "e2", amountPaise: 70_000, approved: false }),
      ],
      splits: [],
    });

    // A pending expense is a claim, not a cost.
    expect(report.totalPaise).toBe(30_000);
    expect(report.pendingPaise).toBe(70_000);
  });

  it("never lets an unapproved expense put a cost on somebody", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: false,
      expenses: [expense({ expenseId: "e2", approved: false })],
      splits: [
        { expenseId: "e2", memberId: "m2", sharePaise: 5_000, guestSharePaise: 0, dependentSharePaise: 0 },
      ],
    });

    expect(report.paidVsShare.find((row) => row.memberId === "m2")?.fairSharePaise).toBe(0);
  });

  it("gives every active member a row even when they spent nothing", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: false,
      expenses: [expense()],
      splits: [],
    });

    expect(report.paidVsShare.map((row) => row.memberId).sort()).toEqual(["m1", "m2"]);
  });

  it("keeps a departed member visible for the month they spent in", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: [
        ...MEMBERS,
        { memberId: "m3", displayName: "Chandra", active: false },
      ],
      isPot: false,
      expenses: [expense({ paidByMemberId: "m3", paidByName: "Chandra" })],
      splits: [],
    });

    // Dropping them is how a month stops adding up.
    expect(report.paidVsShare.find((row) => row.memberId === "m3")?.paidPaise).toBe(10_000);
  });

  it("does not zero the positions it reports while working out who owes whom", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: false,
      expenses: [expense({ amountPaise: 20_000 })],
      splits: [
        { expenseId: "e1", memberId: "m1", sharePaise: 10_000, guestSharePaise: 0, dependentSharePaise: 0 },
        { expenseId: "e1", memberId: "m2", sharePaise: 10_000, guestSharePaise: 0, dependentSharePaise: 0 },
      ],
    });

    expect(report.paidVsShare.find((row) => row.memberId === "m1")?.netPaise).toBe(10_000);
    expect(report.paidVsShare.find((row) => row.memberId === "m2")?.netPaise).toBe(-10_000);
    expect(report.owed).toEqual([
      {
        fromMemberId: "m2",
        fromName: "Bala",
        toMemberId: "m1",
        toName: "Asha",
        amountPaise: 10_000,
      },
    ]);
  });

  it("agrees with the settlement's own calculator, member for member", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: false,
      expenses: [expense({ amountPaise: 33_333 })],
      splits: [
        { expenseId: "e1", memberId: "m1", sharePaise: 16_667, guestSharePaise: 0, dependentSharePaise: 0 },
        { expenseId: "e1", memberId: "m2", sharePaise: 16_666, guestSharePaise: 0, dependentSharePaise: 0 },
      ],
    });

    const settlement = computeBalances(
      report.paidVsShare.map((row) => ({
        memberId: row.memberId,
        paidPaise: row.paidPaise,
        fairSharePaise: row.fairSharePaise,
      })),
    );

    for (const balance of settlement) {
      const row = report.paidVsShare.find((candidate) => candidate.memberId === balance.memberId);
      expect(row?.netPaise).toBe(balance.expenseNetPaise);
    }
  });

  it("nets no debts in a pot house", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: true,
      expenses: [expense({ amountPaise: 20_000 })],
      splits: [
        { expenseId: "e1", memberId: "m2", sharePaise: 20_000, guestSharePaise: 0, dependentSharePaise: 0 },
      ],
    });

    // D-19: a pot house records spending and settles nothing.
    expect(report.owed).toEqual([]);
    expect(report.totalPaise).toBe(20_000);
  });

  it("counts a guest's and a dependent's share against the member carrying them", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: false,
      expenses: [expense({ amountPaise: 60_000 })],
      splits: [
        {
          expenseId: "e1",
          memberId: "m2",
          sharePaise: 20_000,
          guestSharePaise: 20_000,
          dependentSharePaise: 20_000,
        },
      ],
    });

    expect(report.paidVsShare.find((row) => row.memberId === "m2")?.fairSharePaise).toBe(60_000);
  });

  it("ignores an expense outside the range it was asked about", () => {
    const report = buildMoneyInsights({
      range: AUGUST,
      members: MEMBERS,
      isPot: false,
      expenses: [expense({ date: "2026-07-31" }), expense({ expenseId: "e2", date: "2026-09-01" })],
      splits: [],
    });

    expect(report.totalPaise).toBe(0);
  });
});

function assignment(overrides: Partial<ChoreAssignment> = {}): ChoreAssignment {
  return {
    assignmentId: "a1",
    choreDate: "2026-08-10",
    memberId: "m1",
    memberName: "Asha",
    templateName: "Kitchen",
    points: 10,
    status: "confirmed",
    ...overrides,
  };
}

describe("buildChoreInsights", () => {
  it("counts only confirmed work as done", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: false,
      assignments: [
        assignment({ assignmentId: "a1", status: "confirmed" }),
        assignment({ assignmentId: "a2", status: "done_pending" }),
        assignment({ assignmentId: "a3", status: "missed" }),
      ],
    });

    expect(report.summary.confirmedPoints).toBe(10);
    expect(report.summary.pendingPoints).toBe(10);
    expect(report.summary.missedPoints).toBe(10);
  });

  it("leaves a cancelled chore out of both halves", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: false,
      assignments: [
        assignment({ assignmentId: "a1", status: "confirmed" }),
        assignment({ assignmentId: "a2", status: "cancelled" }),
      ],
    });

    // A chore called off is not work somebody failed to do.
    expect(report.summary.assignedPoints).toBe(10);
    expect(report.summary.completionRate).toBe(1);
  });

  it("counts a rejection as missed, not as pending", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: false,
      assignments: [assignment({ status: "rejected" })],
    });

    expect(report.summary.missedPoints).toBe(10);
    expect(report.summary.pendingPoints).toBe(0);
  });

  it("gives a member who did nothing a row of zeroes", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: false,
      assignments: [assignment()],
    });

    const bala = report.byMember.find((row) => row.memberId === "m2");
    expect(bala).toMatchObject({ confirmedPoints: 0, assignedPoints: 0, completionRate: null });
  });

  it("keeps unclaimed work in the house total with nobody to blame for it", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: false,
      assignments: [assignment({ memberId: null, memberName: "Unclaimed", status: "missed" })],
    });

    expect(report.summary.assignedPoints).toBe(10);
    expect(report.byMember.every((row) => row.assignedPoints === 0)).toBe(true);
  });

  it("reports no completion rate when nothing was scheduled", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: false,
      assignments: [],
    });

    expect(report.summary.completionRate).toBeNull();
    expect(report.summary.topThreeShare).toBeNull();
  });

  it("shows a family contribution rather than a ranking", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: true,
      assignments: [
        assignment({ assignmentId: "a1", memberId: "m2", memberName: "Bala", points: 50 }),
        assignment({ assignmentId: "a2", memberId: "m1", memberName: "Asha", points: 10 }),
      ],
    });

    // BR-260: ordered by name, and no concentration metric at all.
    expect(report.ranked).toBe(false);
    expect(report.byMember.map((row) => row.memberName)).toEqual(["Asha", "Bala"]);
    expect(report.summary.topThreeShare).toBeNull();
  });

  it("ranks a shared house by who did most", () => {
    const report = buildChoreInsights({
      range: AUGUST,
      members: MEMBERS,
      isFamily: false,
      assignments: [
        assignment({ assignmentId: "a1", memberId: "m2", memberName: "Bala", points: 50 }),
        assignment({ assignmentId: "a2", memberId: "m1", memberName: "Asha", points: 10 }),
      ],
    });

    expect(report.byMember.map((row) => row.memberName)).toEqual(["Bala", "Asha"]);
    expect(report.summary.topThreeShare).toBe(1);
  });
});

function meal(overrides: Partial<MealRecord> = {}): MealRecord {
  return {
    mealId: "meal1",
    date: "2026-08-10",
    name: "Dosa",
    normalisedName: "dosa",
    source: "home_cooked",
    costPaise: 5_000,
    participantMemberIds: ["m1", "m2"],
    ...overrides,
  };
}

describe("buildFoodInsights", () => {
  it("splits home-cooked from everything somebody else cooked", () => {
    const report = buildFoodInsights({
      range: AUGUST,
      opinions: [],
      meals: [
        meal({ mealId: "m1", source: "home_cooked", costPaise: 5_000 }),
        meal({ mealId: "m2", source: "ordered", costPaise: 30_000 }),
        meal({ mealId: "m3", source: "bought", costPaise: 10_000 }),
      ],
    });

    expect(report.homeCookedPaise).toBe(5_000);
    expect(report.outsidePaise).toBe(40_000);
    expect(report.outsideMeals).toBe(2);
  });

  it("counts one dish however it was capitalised", () => {
    const report = buildFoodInsights({
      range: AUGUST,
      opinions: [],
      meals: [
        meal({ mealId: "m1", name: "Dosa", normalisedName: "dosa" }),
        meal({ mealId: "m2", name: "dosa", normalisedName: "dosa" }),
      ],
    });

    expect(report.mostRepeated).toEqual([{ name: "Dosa", times: 2 }]);
  });

  it("ranks a dish on likes minus dislikes, not on likes alone", () => {
    const report = buildFoodInsights({
      range: AUGUST,
      meals: [meal({ normalisedName: "biryani", name: "Biryani" })],
      opinions: [
        { normalisedName: "biryani", name: "Biryani", memberId: "m1", rating: "like" },
        { normalisedName: "biryani", name: "Biryani", memberId: "m2", rating: "dislike" },
        { normalisedName: "idli", name: "Idli", memberId: "m1", rating: "like" },
      ],
    });

    // A dish half the Home cannot eat is not a house favourite.
    expect(report.mostLiked.map((dish) => dish.name)).toEqual(["Idli"]);
  });

  it("narrows both the meals and the opinions to one person", () => {
    const report = buildFoodInsights({
      range: AUGUST,
      memberFilter: "m1",
      meals: [
        meal({ mealId: "m1", participantMemberIds: ["m1"] }),
        meal({ mealId: "m2", participantMemberIds: ["m2"], costPaise: 90_000 }),
      ],
      opinions: [
        { normalisedName: "dosa", name: "Dosa", memberId: "m1", rating: "like" },
        { normalisedName: "upma", name: "Upma", memberId: "m2", rating: "like" },
      ],
    });

    expect(report.totalPaise).toBe(5_000);
    expect(report.mostLiked.map((dish) => dish.name)).toEqual(["Dosa"]);
  });

  it("treats an 'okay' as neither a like nor a dislike", () => {
    const report = buildFoodInsights({
      range: AUGUST,
      meals: [],
      opinions: [{ normalisedName: "dosa", name: "Dosa", memberId: "m1", rating: "okay" }],
    });

    expect(report.mostLiked).toEqual([]);
  });

  it("lists the most recent meals first", () => {
    const report = buildFoodInsights({
      range: AUGUST,
      opinions: [],
      meals: [
        meal({ mealId: "m1", date: "2026-08-05", name: "Older" }),
        meal({ mealId: "m2", date: "2026-08-20", name: "Newer" }),
      ],
    });

    expect(report.recent.map((row) => row.name)).toEqual(["Newer", "Older"]);
  });
});

describe("buildHomeInsights", () => {
  const base = {
    range: AUGUST,
    expenseCount: 10,
    mealCount: 20,
    choresConfirmed: 30,
    choresMissed: 2,
    decisionsOpen: 1,
    decisionsResolved: 4,
    activeMembers: 4,
    isFamily: false,
    effortByMember: [
      { memberId: "m1", displayName: "Asha", points: 60 },
      { memberId: "m2", displayName: "Bala", points: 20 },
      { memberId: "m3", displayName: "Chandra", points: 20 },
      { memberId: "m4", displayName: "Divya", points: 0 },
    ],
  };

  it("answers how busy the Home is, per person", () => {
    expect(buildHomeInsights(base).activity.recordsPerMember).toBe(15);
  });

  it("reports the top-three concentration and the furthest outlier", () => {
    const report = buildHomeInsights(base);
    expect(report.imbalance.topThreeShare).toBe(1);
    expect(report.imbalance.maxDeviationPoints).toBe(35);
  });

  it("shows a family neither figure", () => {
    const report = buildHomeInsights({ ...base, isFamily: true });
    expect(report.imbalance).toEqual({ topThreeShare: null, maxDeviationPoints: null });
  });

  it("reports no concentration in a house that has confirmed nothing", () => {
    const report = buildHomeInsights({
      ...base,
      effortByMember: base.effortByMember.map((row) => ({ ...row, points: 0 })),
    });
    expect(report.imbalance.topThreeShare).toBeNull();
  });

  it("does not divide by an empty Home", () => {
    const report = buildHomeInsights({ ...base, activeMembers: 0, effortByMember: [] });
    expect(report.activity.recordsPerMember).toBeNull();
  });
});

describe("buildFinancialPosition", () => {
  const input = {
    period: "2026-08",
    reserveBalancePaise: 50_000,
    reserveMovements: [
      { date: "2026-08-01", kind: "contribution", amountPaise: 30_000, note: null },
      { date: "2026-08-15", kind: "draw", amountPaise: -10_000, note: "Plumber" },
    ],
    members: [
      {
        memberId: "m1",
        displayName: "Asha",
        expectedContributionPaise: 500_000,
        paidPaise: 600_000,
        fairSharePaise: 400_000,
      },
      {
        memberId: "m2",
        displayName: "Bala",
        expectedContributionPaise: 500_000,
        paidPaise: 200_000,
        fairSharePaise: 400_000,
      },
    ],
  };

  it("takes 'paid minus fair share' from the settlement's own calculator", () => {
    const position = buildFinancialPosition(input);
    const settlement = computeBalances(
      input.members.map((member) => ({
        memberId: member.memberId,
        paidPaise: member.paidPaise,
        fairSharePaise: member.fairSharePaise,
      })),
    );

    for (const balance of settlement) {
      const row = position.members.find((member) => member.memberId === balance.memberId);
      expect(row?.netPaise).toBe(balance.expenseNetPaise);
    }
  });

  it("reports the Home's shortfall against what it asked for", () => {
    const position = buildFinancialPosition(input);
    expect(position.expectedPaise).toBe(1_000_000);
    expect(position.actualPaise).toBe(800_000);
    expect(position.surplusPaise).toBe(-200_000);
  });

  it("shows each member's gap against their own expected contribution", () => {
    const position = buildFinancialPosition(input);
    expect(position.members.find((m) => m.memberId === "m1")?.contributionGapPaise).toBe(100_000);
    expect(position.members.find((m) => m.memberId === "m2")?.contributionGapPaise).toBe(-300_000);
  });

  it("lists reserve movements newest first", () => {
    const position = buildFinancialPosition(input);
    expect(position.reserveMovements.map((movement) => movement.date)).toEqual([
      "2026-08-15",
      "2026-08-01",
    ]);
  });
});

describe("explainPoints", () => {
  it("reconciles a total with the records that produced it", () => {
    const breakdown = explainPoints({
      memberId: "m1",
      displayName: "Asha",
      claimedPoints: 25,
      components: [
        { date: "2026-08-01", label: "Kitchen", points: 10, status: "confirmed" },
        { date: "2026-08-08", label: "Bathroom", points: 15, status: "confirmed" },
      ],
    });

    expect(breakdown.componentPoints).toBe(25);
    expect(breakdown.reconciles).toBe(true);
  });

  it("explains a zero as readily as a total", () => {
    const breakdown = explainPoints({
      memberId: "m2",
      displayName: "Bala",
      claimedPoints: 0,
      components: [],
    });

    // EF-12: an empty list that reconciles with zero is a complete answer, not
    // a screen that failed to load.
    expect(breakdown.reconciles).toBe(true);
    expect(breakdown.components).toEqual([]);
  });

  it("says so when the components do not add up to the figure shown", () => {
    const breakdown = explainPoints({
      memberId: "m1",
      displayName: "Asha",
      claimedPoints: 30,
      components: [{ date: "2026-08-01", label: "Kitchen", points: 10, status: "confirmed" }],
    });

    expect(breakdown.reconciles).toBe(false);
  });

  it("opens newest first", () => {
    const breakdown = explainPoints({
      memberId: "m1",
      displayName: "Asha",
      claimedPoints: 20,
      components: [
        { date: "2026-08-01", label: "Older", points: 10, status: "confirmed" },
        { date: "2026-08-20", label: "Newer", points: 10, status: "confirmed" },
      ],
    });

    expect(breakdown.components.map((component) => component.label)).toEqual(["Newer", "Older"]);
  });

  it("keeps unconfirmed work out of a breakdown of earned points", () => {
    const components = earnedComponents([
      { date: "2026-08-01", label: "Kitchen", points: 10, status: "confirmed" },
      { date: "2026-08-02", label: "Bathroom", points: 10, status: "done_pending" },
      { date: "2026-08-03", label: "Mopping", points: 10, status: "missed" },
    ]);

    expect(components.map((component) => component.label)).toEqual(["Kitchen"]);
  });
});
