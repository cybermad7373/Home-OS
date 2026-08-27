/**
 * What the house costs to run, per day.
 *
 * Pure: dated amounts in, a summary out. No database, no framework, no clock —
 * "today" is an argument, because a function that reads the wall clock cannot
 * be tested and gets the house's timezone wrong at midnight.
 *
 * This is the number both kinds of household actually asked for, from opposite
 * directions. A flat wants it because ₹1,850 a day is the sentence that makes
 * "we're spending too much on Swiggy" concrete. A family wants it because the
 * monthly total arrives too late to do anything about.
 */

export interface DatedAmount {
  /** ISO date, YYYY-MM-DD, in the house's timezone. */
  date: string;
  amountPaise: number;
  categoryId: string;
}

export interface CategoryBudget {
  categoryId: string;
  name: string;
  icon: string | null;
  monthlyBudgetPaise: number | null;
}

export interface DailyCostInput {
  /** Every approved expense in the month, already converted to house dates. */
  expenses: DatedAmount[];
  /** First day of the month, YYYY-MM-01. */
  monthStart: string;
  /** Today, in the house's timezone. Must fall inside the month. */
  today: string;
  /** Heads the cost is divided by: paying members plus the people they carry. */
  heads: number;
  categories: CategoryBudget[];
  /** What the house means to spend in a day. Null when it has no opinion. */
  dailyBudgetPaise: number | null;
}

export interface DaySpend {
  date: string;
  amountPaise: number;
}

export interface CategorySpend {
  categoryId: string;
  name: string;
  icon: string | null;
  spentPaise: number;
  budgetPaise: number | null;
  /** Null when there is no budget to be a fraction of. */
  fractionUsed: number | null;
  /** True once spending has passed the budget. */
  over: boolean;
}

export interface DailyCostSummary {
  todayPaise: number;
  todayPerHeadPaise: number;
  monthToDatePaise: number;
  /** Mean over the days elapsed, including the days nothing was spent. */
  averagePerDayPaise: number;
  averagePerDayPerHeadPaise: number;
  /** The last seven days ending today, same treatment. */
  last7AveragePaise: number;
  /** Month-to-date plus the average rate for the days left. */
  projectedMonthPaise: number;
  daysElapsed: number;
  daysInMonth: number;
  /** Null when the house set no daily budget. */
  dailyBudgetPaise: number | null;
  budgetVerdict: BudgetVerdict;
  /** Every day of the month so far, oldest first, gaps filled with zero. */
  series: DaySpend[];
  categories: CategorySpend[];
  /** The single largest day this month, or null if nothing has been spent. */
  biggestDay: DaySpend | null;
}

/**
 * 'under' / 'over' compare the running average against the daily budget rather
 * than today alone. One expensive Saturday is not a problem; a fortnight of
 * them is, and only the average can tell the two apart.
 */
export type BudgetVerdict = "none" | "under" | "close" | "over";

export function daysInMonthOf(monthStart: string): number {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Every date of the month up to and including `today`, oldest first. */
export function datesElapsed(monthStart: string, today: string): string[] {
  const [year, month] = monthStart.split("-").map(Number);
  const last = Number(today.slice(8, 10));
  const dates: string[] = [];
  for (let day = 1; day <= last; day += 1) {
    dates.push(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  return dates;
}

/**
 * Integer division that rounds to nearest rather than truncating. Every figure
 * here is a paise count shown to a person, so a consistent half-up beats
 * silently losing a paisa off each average.
 */
function divideRounded(total: number, by: number): number {
  if (by <= 0) return 0;
  return Math.round(total / by);
}

export function summariseDailyCost(input: DailyCostInput): DailyCostSummary {
  const daysInMonth = daysInMonthOf(input.monthStart);
  const elapsed = datesElapsed(input.monthStart, input.today);
  const daysElapsed = elapsed.length;

  const byDate = new Map<string, number>();
  const byCategory = new Map<string, number>();
  let monthToDatePaise = 0;

  for (const expense of input.expenses) {
    byDate.set(expense.date, (byDate.get(expense.date) ?? 0) + expense.amountPaise);
    byCategory.set(
      expense.categoryId,
      (byCategory.get(expense.categoryId) ?? 0) + expense.amountPaise,
    );
    monthToDatePaise += expense.amountPaise;
  }

  // Days with no spending are real days and belong in the divisor. Averaging
  // only over the days money was spent flatters a house that shops weekly.
  const series: DaySpend[] = elapsed.map((date) => ({
    date,
    amountPaise: byDate.get(date) ?? 0,
  }));

  const last7 = series.slice(-7);
  const last7Total = last7.reduce((sum, day) => sum + day.amountPaise, 0);

  const averagePerDayPaise = divideRounded(monthToDatePaise, daysElapsed);
  const todayPaise = byDate.get(input.today) ?? 0;

  // The days already counted use what was actually spent; the rest of the month
  // is charged at the rate so far. It is a projection, not a forecast, and the
  // interface says so.
  const remainingDays = Math.max(0, daysInMonth - daysElapsed);
  const projectedMonthPaise = monthToDatePaise + averagePerDayPaise * remainingDays;

  const heads = Math.max(1, input.heads);

  const categories: CategorySpend[] = input.categories
    .map((category) => {
      const spentPaise = byCategory.get(category.categoryId) ?? 0;
      const budgetPaise = category.monthlyBudgetPaise;
      return {
        categoryId: category.categoryId,
        name: category.name,
        icon: category.icon,
        spentPaise,
        budgetPaise,
        fractionUsed:
          budgetPaise && budgetPaise > 0 ? spentPaise / budgetPaise : null,
        over: budgetPaise !== null && budgetPaise > 0 && spentPaise > budgetPaise,
      };
    })
    // Biggest spend first, and a category nobody has used yet drops to the
    // bottom rather than off the list — a zero is information when there is a
    // budget attached to it.
    .sort((a, b) => b.spentPaise - a.spentPaise);

  const biggestDay = series.reduce<DaySpend | null>(
    (best, day) =>
      day.amountPaise > 0 && (best === null || day.amountPaise > best.amountPaise)
        ? day
        : best,
    null,
  );

  return {
    todayPaise,
    todayPerHeadPaise: divideRounded(todayPaise, heads),
    monthToDatePaise,
    averagePerDayPaise,
    averagePerDayPerHeadPaise: divideRounded(averagePerDayPaise, heads),
    last7AveragePaise: divideRounded(last7Total, last7.length),
    projectedMonthPaise,
    daysElapsed,
    daysInMonth,
    dailyBudgetPaise: input.dailyBudgetPaise,
    budgetVerdict: verdictFor(averagePerDayPaise, input.dailyBudgetPaise),
    series,
    categories,
    biggestDay,
  };
}

export function verdictFor(
  averagePerDayPaise: number,
  dailyBudgetPaise: number | null,
): BudgetVerdict {
  if (dailyBudgetPaise === null || dailyBudgetPaise <= 0) return "none";
  if (averagePerDayPaise > dailyBudgetPaise) return "over";
  // Within a tenth of the budget is not "under" in any useful sense. Saying so
  // a few days early is the only way the number changes what anybody does.
  if (averagePerDayPaise >= dailyBudgetPaise * 0.9) return "close";
  return "under";
}
