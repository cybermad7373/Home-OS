import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  datesElapsed,
  daysInMonthOf,
  summariseDailyCost,
  verdictFor,
  type CategoryBudget,
  type DatedAmount,
} from "@/lib/domain/analytics/daily-cost";

const CATEGORIES: CategoryBudget[] = [
  {
    categoryId: "c-food",
    name: "Groceries",
    icon: "🥬",
    monthlyBudgetPaise: 3000000, // ₹30,000
  },
  { categoryId: "c-gas", name: "Gas", icon: "🔥", monthlyBudgetPaise: null },
];

function base(overrides: Partial<Parameters<typeof summariseDailyCost>[0]> = {}) {
  return summariseDailyCost({
    expenses: [],
    monthStart: "2026-08-01",
    today: "2026-08-10",
    heads: 8,
    categories: CATEGORIES,
    dailyBudgetPaise: null,
    ...overrides,
  });
}

describe("daysInMonthOf", () => {
  it("knows the short months and the leap year", () => {
    expect(daysInMonthOf("2026-08-01")).toBe(31);
    expect(daysInMonthOf("2026-02-01")).toBe(28);
    expect(daysInMonthOf("2028-02-01")).toBe(29);
    expect(daysInMonthOf("2026-04-01")).toBe(30);
  });
});

describe("datesElapsed", () => {
  it("runs from the first to today inclusive", () => {
    const dates = datesElapsed("2026-08-01", "2026-08-03");
    expect(dates).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("is one day long on the first of the month", () => {
    expect(datesElapsed("2026-08-01", "2026-08-01")).toEqual(["2026-08-01"]);
  });
});

describe("summariseDailyCost", () => {
  it("counts days with no spending in the average", () => {
    // ₹7,000 on one day of ten is ₹700 a day, not ₹7,000 a day. A house that
    // shops weekly would otherwise see a wildly overstated running cost.
    const summary = base({
      expenses: [{ date: "2026-08-04", amountPaise: 700000, categoryId: "c-food" }],
    });

    expect(summary.daysElapsed).toBe(10);
    expect(summary.monthToDatePaise).toBe(700000);
    expect(summary.averagePerDayPaise).toBe(70000);
  });

  it("divides today's spend by every head, dependents included", () => {
    const summary = base({
      today: "2026-08-10",
      heads: 5,
      expenses: [{ date: "2026-08-10", amountPaise: 100000, categoryId: "c-food" }],
    });

    expect(summary.todayPaise).toBe(100000);
    expect(summary.todayPerHeadPaise).toBe(20000);
  });

  it("projects the rest of the month at the rate so far", () => {
    const summary = base({
      today: "2026-08-10",
      expenses: Array.from({ length: 10 }, (_unused, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        amountPaise: 100000,
        categoryId: "c-food",
      })),
    });

    // ₹1,000 a day for ten days, twenty-one days left: ₹31,000 for the month.
    expect(summary.averagePerDayPaise).toBe(100000);
    expect(summary.projectedMonthPaise).toBe(3100000);
  });

  it("projects exactly the month-to-date on the last day", () => {
    const summary = base({
      today: "2026-08-31",
      expenses: [{ date: "2026-08-31", amountPaise: 500000, categoryId: "c-food" }],
    });

    expect(summary.daysElapsed).toBe(31);
    expect(summary.projectedMonthPaise).toBe(summary.monthToDatePaise);
  });

  it("averages the last seven days over seven days, not over the month", () => {
    const summary = base({
      today: "2026-08-20",
      expenses: [
        { date: "2026-08-02", amountPaise: 1000000, categoryId: "c-food" },
        { date: "2026-08-18", amountPaise: 70000, categoryId: "c-food" },
      ],
    });

    // Only the ₹700 falls in the window: ₹700 over seven days is ₹100 a day.
    expect(summary.last7AveragePaise).toBe(10000);
  });

  it("fills the series with zeroes so a chart has no gaps", () => {
    const summary = base({
      today: "2026-08-05",
      expenses: [{ date: "2026-08-03", amountPaise: 50000, categoryId: "c-food" }],
    });

    expect(summary.series).toEqual([
      { date: "2026-08-01", amountPaise: 0 },
      { date: "2026-08-02", amountPaise: 0 },
      { date: "2026-08-03", amountPaise: 50000 },
      { date: "2026-08-04", amountPaise: 0 },
      { date: "2026-08-05", amountPaise: 0 },
    ]);
  });

  it("names the biggest day, and returns null when nothing was spent", () => {
    expect(base().biggestDay).toBeNull();

    const summary = base({
      expenses: [
        { date: "2026-08-02", amountPaise: 30000, categoryId: "c-food" },
        { date: "2026-08-07", amountPaise: 90000, categoryId: "c-gas" },
      ],
    });
    expect(summary.biggestDay).toEqual({ date: "2026-08-07", amountPaise: 90000 });
  });

  it("reports a category over its budget, and leaves an unbudgeted one alone", () => {
    const summary = base({
      expenses: [
        { date: "2026-08-02", amountPaise: 3500000, categoryId: "c-food" },
        { date: "2026-08-03", amountPaise: 120000, categoryId: "c-gas" },
      ],
    });

    const food = summary.categories.find((row) => row.categoryId === "c-food");
    const gas = summary.categories.find((row) => row.categoryId === "c-gas");

    expect(food?.over).toBe(true);
    expect(food?.fractionUsed).toBeCloseTo(3500000 / 3000000);
    expect(gas?.over).toBe(false);
    expect(gas?.fractionUsed).toBeNull();
  });

  it("orders categories by spend, biggest first", () => {
    const summary = base({
      expenses: [
        { date: "2026-08-02", amountPaise: 10000, categoryId: "c-food" },
        { date: "2026-08-02", amountPaise: 90000, categoryId: "c-gas" },
      ],
    });

    expect(summary.categories.map((row) => row.categoryId)).toEqual([
      "c-gas",
      "c-food",
    ]);
  });

  it("survives a head count of zero rather than dividing by it", () => {
    const summary = base({
      heads: 0,
      expenses: [{ date: "2026-08-10", amountPaise: 100000, categoryId: "c-food" }],
    });
    expect(summary.todayPerHeadPaise).toBe(100000);
  });
});

describe("verdictFor", () => {
  it("says nothing when the house set no budget", () => {
    expect(verdictFor(500000, null)).toBe("none");
    expect(verdictFor(500000, 0)).toBe("none");
  });

  it("warns before the budget is passed, not after", () => {
    expect(verdictFor(80000, 100000)).toBe("under");
    expect(verdictFor(90000, 100000)).toBe("close");
    expect(verdictFor(100000, 100000)).toBe("close");
    expect(verdictFor(100001, 100000)).toBe("over");
  });
});

describe("properties", () => {
  it("never reports a month-to-date that differs from the sum of its series", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 20 }),
            amountPaise: fc.integer({ min: 1, max: 5_000_00 }),
          }),
          { maxLength: 60 },
        ),
        (rows) => {
          const expenses: DatedAmount[] = rows.map((row) => ({
            date: `2026-08-${String(row.day).padStart(2, "0")}`,
            amountPaise: row.amountPaise,
            categoryId: "c-food",
          }));

          const summary = base({ today: "2026-08-20", expenses });
          const seriesTotal = summary.series.reduce(
            (sum, day) => sum + day.amountPaise,
            0,
          );

          // The chart and the headline figure are the same money. If they ever
          // disagree, one of them is lying to the house.
          expect(seriesTotal).toBe(summary.monthToDatePaise);
          expect(summary.series).toHaveLength(20);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never projects less than what has already been spent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.array(fc.integer({ min: 0, max: 2_000_00 }), { minLength: 1, maxLength: 28 }),
        (todayDay, amounts) => {
          const expenses: DatedAmount[] = amounts.map((amountPaise, index) => ({
            date: `2026-08-${String((index % todayDay) + 1).padStart(2, "0")}`,
            amountPaise,
            categoryId: "c-food",
          }));

          const summary = base({
            today: `2026-08-${String(todayDay).padStart(2, "0")}`,
            expenses,
          });

          expect(summary.projectedMonthPaise).toBeGreaterThanOrEqual(
            summary.monthToDatePaise,
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
