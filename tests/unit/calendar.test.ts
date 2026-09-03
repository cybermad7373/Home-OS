import { describe, expect, it } from "vitest";
import {
  boundsOfMonth,
  completionRate,
  datesOfMonth,
  datesOfWeek,
  dayDensity,
  mealSpend,
  moneyRollup,
  pointsByMember,
  weekStartOfDate,
} from "@/lib/domain/home/calendar";

/**
 * S-52 — the Calendar owns no data. What it does own is the arithmetic of the
 * composition, and that is what is tested here.
 */

describe("completionRate", () => {
  const chore = (status: string) => ({ status, effortPoints: 10, assigneeMemberId: "a" });

  it("counts a confirmed chore as done and a missed one as not", () => {
    const rate = completionRate([chore("confirmed"), chore("confirmed"), chore("missed")]);

    expect(rate).toEqual({ confirmed: 2, total: 3, rate: 2 / 3 });
  });

  it("keeps an unfinished chore in the denominator", () => {
    expect(completionRate([chore("confirmed"), chore("assigned")]).rate).toBe(0.5);
  });

  it("leaves a cancelled chore out of both halves", () => {
    expect(completionRate([chore("confirmed"), chore("cancelled")])).toEqual({
      confirmed: 1,
      total: 1,
      rate: 1,
    });
  });

  it("has no rate at all when nothing was scheduled", () => {
    expect(completionRate([])).toEqual({ confirmed: 0, total: 0, rate: null });
    expect(completionRate([chore("cancelled")]).rate).toBeNull();
  });
});

describe("pointsByMember", () => {
  it("counts confirmed work only, and ranks by points", () => {
    const rows = pointsByMember([
      { status: "confirmed", effortPoints: 30, assigneeMemberId: "a" },
      { status: "confirmed", effortPoints: 10, assigneeMemberId: "b" },
      { status: "confirmed", effortPoints: 20, assigneeMemberId: "b" },
      { status: "done_pending", effortPoints: 50, assigneeMemberId: "c" },
      { status: "missed", effortPoints: 40, assigneeMemberId: "a" },
    ]);

    expect(rows).toEqual([
      { memberId: "a", points: 30 },
      { memberId: "b", points: 30 },
    ]);
  });

  it("ignores an unassigned chore rather than crediting nobody", () => {
    expect(
      pointsByMember([{ status: "confirmed", effortPoints: 10, assigneeMemberId: null }]),
    ).toEqual([]);
  });
});

describe("mealSpend", () => {
  it("splits home cooking from every way of not cooking", () => {
    expect(
      mealSpend([
        { source: "home_cooked", totalCostPaise: 20000 },
        { source: "ordered", totalCostPaise: 45000 },
        { source: "bought", totalCostPaise: 15000 },
        { source: "other", totalCostPaise: 5000 },
      ]),
    ).toEqual({ homeCookedPaise: 20000, outsidePaise: 65000, totalPaise: 85000 });
  });

  it("is all zeroes when nothing was recorded", () => {
    expect(mealSpend([])).toEqual({ homeCookedPaise: 0, outsidePaise: 0, totalPaise: 0 });
  });
});

describe("moneyRollup", () => {
  it("sums approved expenses only, and counts the pending ones", () => {
    expect(
      moneyRollup([
        { amountPaise: 10000, status: "approved" },
        { amountPaise: 90000, status: "pending_approval" },
        { amountPaise: 5000, status: "approved" },
        { amountPaise: 1000, status: "rejected" },
      ]),
    ).toEqual({ totalPaise: 15000, pendingApprovals: 1 });
  });
});

describe("datesOfWeek", () => {
  it("returns seven consecutive days from the Monday given", () => {
    expect(datesOfWeek("2026-08-24")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("crosses a month boundary without losing a day", () => {
    expect(datesOfWeek("2026-08-31")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });
});

describe("weekStartOfDate", () => {
  it("finds the Monday on or before a date", () => {
    expect(weekStartOfDate("2026-08-26")).toBe("2026-08-24");
    expect(weekStartOfDate("2026-08-24")).toBe("2026-08-24");
  });

  it("puts Sunday at the end of its week, not the start of the next", () => {
    expect(weekStartOfDate("2026-08-30")).toBe("2026-08-24");
  });
});

describe("boundsOfMonth", () => {
  it("ends on the real last day of the month", () => {
    expect(boundsOfMonth("2026-08")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(boundsOfMonth("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(boundsOfMonth("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("knows a leap February", () => {
    expect(boundsOfMonth("2028-02").to).toBe("2028-02-29");
  });
});

describe("datesOfMonth", () => {
  it("gives every day of the month, in order", () => {
    const dates = datesOfMonth("2026-09");
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-09-01");
    expect(dates.at(-1)).toBe("2026-09-30");
  });

  it("knows a leap February", () => {
    expect(datesOfMonth("2028-02")).toHaveLength(29);
  });
});

describe("dayDensity", () => {
  const dates = ["2026-09-01", "2026-09-02", "2026-09-03"];

  it("returns a row for every date, including the empty ones", () => {
    const rows = dayDensity(dates, [], [], []);
    expect(rows.map((row) => row.date)).toEqual(dates);
    expect(rows.every((row) => row.chores === 0 && row.expensePaise === 0)).toBe(true);
  });

  it("separates the chores that were confirmed from the ones that only exist", () => {
    const rows = dayDensity(
      dates,
      [
        { choreDate: "2026-09-01", status: "confirmed" },
        { choreDate: "2026-09-01", status: "missed" },
        { choreDate: "2026-09-01", status: "assigned" },
      ],
      [],
      [],
    );
    expect(rows[0].chores).toBe(3);
    expect(rows[0].choresDone).toBe(1);
  });

  it("counts only approved money towards a day's spend", () => {
    const rows = dayDensity(
      dates,
      [],
      [],
      [
        { expenseDate: "2026-09-02", amountPaise: 50_000, status: "approved" },
        { expenseDate: "2026-09-02", amountPaise: 99_900, status: "pending_approval" },
        { expenseDate: "2026-09-02", amountPaise: 10_000, status: "rejected" },
      ],
    );
    expect(rows[1].expensePaise).toBe(50_000);
  });

  it("ignores rows dated outside the range it was asked about", () => {
    const rows = dayDensity(
      dates,
      [{ choreDate: "2026-08-31", status: "confirmed" }],
      [{ mealDate: "2026-10-01" }],
      [{ expenseDate: "2026-09-09", amountPaise: 1, status: "approved" }],
    );
    expect(rows.reduce((sum, row) => sum + row.chores + row.meals + row.expensePaise, 0)).toBe(0);
  });
});
