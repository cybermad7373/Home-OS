import { describe, expect, it } from "vitest";
import {
  buildMemberPositionReport,
  buildEffortConcentrationReport,
  buildSpendReport,
  type EffortConcentrationReportInput,
  type MemberPositionReportInput,
  type SpendReportInput,
} from "@/lib/domain/analytics/report";

const base: SpendReportInput = {
  expenses: [
    { period: "2026-08", categoryId: "food", categoryName: "Food", amountPaise: 12000 },
    { period: "2026-08", categoryId: "rent", categoryName: "Rent", amountPaise: 30000 },
    { period: "2026-07", categoryId: "food", categoryName: "Food", amountPaise: 8000 },
  ],
  months: ["2026-07", "2026-08"],
};

describe("buildSpendReport", () => {
  it("groups approved spending by month and category, including zero months", () => {
    expect(buildSpendReport(base)).toEqual({
      months: ["2026-07", "2026-08"],
      totals: [8000, 42000],
      categories: [
        { categoryId: "rent", name: "Rent", totals: [0, 30000] },
        { categoryId: "food", name: "Food", totals: [8000, 12000] },
      ],
    });
  });

  it("sorts categories by recent spend and never emits negative totals", () => {
    expect(
      buildSpendReport({
        months: ["2026-08"],
        expenses: [
          { period: "2026-08", categoryId: "other", categoryName: "Other", amountPaise: -1 },
          { period: "2026-08", categoryId: "food", categoryName: "Food", amountPaise: 500 },
        ],
      }).categories,
    ).toEqual([{ categoryId: "food", name: "Food", totals: [500] }, { categoryId: "other", name: "Other", totals: [0] }]);
  });
});

describe("buildMemberPositionReport", () => {
  it("compares approved payments with every stored share, including a former member", () => {
    const input: MemberPositionReportInput = {
      period: "2026-08",
      members: [
        { memberId: "ravi", displayName: "Ravi", active: true },
        { memberId: "meera", displayName: "Meera", active: true },
        { memberId: "arun", displayName: "Arun", active: false },
      ],
      expenses: [
        { expenseId: "shop", paidByMemberId: "ravi", amountPaise: 90000, approved: true },
        { expenseId: "pending", paidByMemberId: "meera", amountPaise: 50000, approved: false },
      ],
      splits: [
        { expenseId: "shop", memberId: "ravi", sharePaise: 20000, guestSharePaise: 0, dependentSharePaise: 10000 },
        { expenseId: "shop", memberId: "meera", sharePaise: 30000, guestSharePaise: 0, dependentSharePaise: 0 },
        { expenseId: "shop", memberId: "arun", sharePaise: 20000, guestSharePaise: 10000, dependentSharePaise: 0 },
        { expenseId: "pending", memberId: "meera", sharePaise: 50000, guestSharePaise: 0, dependentSharePaise: 0 },
      ],
    };

    expect(buildMemberPositionReport(input)).toEqual({
      period: "2026-08",
      totalPaidPaise: 90000,
      totalFairSharePaise: 90000,
      members: [
        { memberId: "ravi", displayName: "Ravi", paidPaise: 90000, fairSharePaise: 30000, netPaise: 60000 },
        { memberId: "meera", displayName: "Meera", paidPaise: 0, fairSharePaise: 30000, netPaise: -30000 },
        { memberId: "arun", displayName: "Arun", paidPaise: 0, fairSharePaise: 30000, netPaise: -30000 },
      ],
    });
  });
});

describe("buildEffortConcentrationReport", () => {
  it("groups earned points by month and reports the top-three share, including empty months", () => {
    const input: EffortConcentrationReportInput = {
      months: ["2026-06", "2026-07", "2026-08"],
      rows: [
        { month: "2026-06", memberId: "ravi", earnedPoints: 40 },
        { month: "2026-06", memberId: "meera", earnedPoints: 20 },
        { month: "2026-06", memberId: "arun", earnedPoints: 10 },
        { month: "2026-06", memberId: "zoya", earnedPoints: 5 },
        { month: "2026-07", memberId: "ravi", earnedPoints: 0 },
        { month: "2026-08", memberId: "ravi", earnedPoints: 30 },
        { month: "2026-08", memberId: "meera", earnedPoints: 30 },
        { month: "2026-08", memberId: "arun", earnedPoints: 30 },
        { month: "2026-08", memberId: "zoya", earnedPoints: 30 },
      ],
    };

    expect(buildEffortConcentrationReport(input)).toEqual({
      months: ["2026-06", "2026-07", "2026-08"],
      history: [
        { month: "2026-06", totalEarnedPoints: 75, topThreeEarnedPoints: 70, concentrationRatio: 70 / 75 },
        { month: "2026-07", totalEarnedPoints: 0, topThreeEarnedPoints: 0, concentrationRatio: 0 },
        { month: "2026-08", totalEarnedPoints: 120, topThreeEarnedPoints: 90, concentrationRatio: 0.75 },
      ],
    });
  });
});
