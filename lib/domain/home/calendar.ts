/**
 * The Calendar's pure layer — S-52.
 *
 * The Calendar owns no data (docs/05-API-SPEC.md section 11). It is a
 * composition over chores, money, food, presence and decisions, and everything
 * in this file is the arithmetic of that composition: rollups, rates and
 * splits. No database, no framework, so the same figures can be asserted
 * without one.
 */

export interface ChoreForRollup {
  status: string;
  effortPoints: number;
  assigneeMemberId: string | null;
}

export interface MealForRollup {
  source: string;
  totalCostPaise: number;
}

export interface ExpenseForRollup {
  amountPaise: number;
  status: string;
}

/**
 * A chore that was cancelled was never work anybody owed, so it is not in the
 * denominator. One that is still `assigned` on a day already past is not
 * finished, and *is* — leaving it out would make a Home that ignores its
 * chores look like a Home with a perfect record.
 */
const COUNTS_TOWARDS_COMPLETION = new Set([
  "assigned",
  "open",
  "done_pending",
  "confirmed",
  "rejected",
  "missed",
]);

export interface CompletionRate {
  confirmed: number;
  total: number;
  /** 0 to 1, or null when there was nothing to do. */
  rate: number | null;
}

export function completionRate(chores: ChoreForRollup[]): CompletionRate {
  const counted = chores.filter((chore) => COUNTS_TOWARDS_COMPLETION.has(chore.status));
  const confirmed = counted.filter((chore) => chore.status === "confirmed").length;

  return {
    confirmed,
    total: counted.length,
    // A Home with nothing scheduled has no completion rate. Reporting 0% would
    // read as a failure, and 100% as an achievement; neither happened.
    rate: counted.length === 0 ? null : confirmed / counted.length,
  };
}

export interface MemberPoints {
  memberId: string;
  points: number;
}

/** Points per member, confirmed only — the same rule the effort ledger uses. */
export function pointsByMember(chores: ChoreForRollup[]): MemberPoints[] {
  const totals = new Map<string, number>();

  for (const chore of chores) {
    if (chore.status !== "confirmed" || !chore.assigneeMemberId) continue;
    totals.set(
      chore.assigneeMemberId,
      (totals.get(chore.assigneeMemberId) ?? 0) + chore.effortPoints,
    );
  }

  return [...totals.entries()]
    .map(([memberId, points]) => ({ memberId, points }))
    .sort((a, b) => b.points - a.points || (a.memberId < b.memberId ? -1 : 1));
}

export interface MealSpend {
  homeCookedPaise: number;
  outsidePaise: number;
  totalPaise: number;
}

/**
 * Home cooking against everything else.
 *
 * `bought`, `ordered` and `other` are all money that left the Home for food
 * somebody else made. The distinction the Home actually acts on is "did we
 * cook", not the three ways of not cooking (docs/15-FOOD-SPEC.md section 10).
 */
export function mealSpend(meals: MealForRollup[]): MealSpend {
  let homeCookedPaise = 0;
  let outsidePaise = 0;

  for (const meal of meals) {
    if (meal.source === "home_cooked") homeCookedPaise += meal.totalCostPaise;
    else outsidePaise += meal.totalCostPaise;
  }

  return { homeCookedPaise, outsidePaise, totalPaise: homeCookedPaise + outsidePaise };
}

export interface MoneyRollup {
  totalPaise: number;
  pendingApprovals: number;
}

/**
 * BR-084 — only approved expenses count towards anybody's position, and the
 * Calendar is a position. The pending ones are counted, not summed: "three
 * waiting" is what the reader can act on, and adding them into the total would
 * state money the Home has not agreed it spent.
 */
export function moneyRollup(expenses: ExpenseForRollup[]): MoneyRollup {
  return {
    totalPaise: expenses
      .filter((expense) => expense.status === "approved")
      .reduce((sum, expense) => sum + expense.amountPaise, 0),
    pendingApprovals: expenses.filter((expense) => expense.status === "pending_approval").length,
  };
}

/**
 * The seven dates of a week, from its Monday. The chore engine's own
 * `weekDates` does this for the scheduler; the Calendar needs the same seven
 * days for a range read and should not import a scheduling concern to get them.
 */
export function datesOfWeek(weekStart: string): string[] {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  );
}

/** First and last day of a `YYYY-MM` period, inclusive. */
export function boundsOfMonth(period: string): { from: string; to: string } {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, "0")}` };
}

/** The Monday on or before a date, in the Home's own dates rather than UTC. */
export function weekStartOfDate(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  const weekday = new Date(parsed).getUTCDay();
  // getUTCDay puts Sunday at 0; the week starts on Monday.
  const back = (weekday + 6) % 7;
  return new Date(parsed - back * 86_400_000).toISOString().slice(0, 10);
}
