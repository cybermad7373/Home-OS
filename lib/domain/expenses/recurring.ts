import { houseToday } from "@/lib/utils/date";

/**
 * Recurring expense scheduling. Pure, so the rollover arithmetic can be tested
 * without waiting a month for it to happen.
 *
 * BR-096 — the day of month is capped at 28, so no month is ever too short for
 * a recurring expense to land. That cap is why none of this needs a "last day
 * of month" special case.
 */

/** The next occurrence on or after today, in the house's timezone. */
export function nextRunDate(
  dayOfMonth: number,
  timezone: string,
  from?: string,
): string {
  const today = from ?? houseToday(timezone);
  const [year, month, day] = today.split("-").map(Number);

  if (day <= dayOfMonth) {
    return format(year, month, dayOfMonth);
  }
  return month === 12
    ? format(year + 1, 1, dayOfMonth)
    : format(year, month + 1, dayOfMonth);
}

/** The occurrence after the one that just posted. */
export function advanceRunDate(currentRunDate: string): string {
  const [year, month, day] = currentRunDate.split("-").map(Number);
  return month === 12 ? format(year + 1, 1, day) : format(year, month + 1, day);
}

/** True when this definition is due to post on the given house date. */
export function isDue(
  definition: { active: boolean; next_run_date: string },
  onDate: string,
): boolean {
  // On or before, not exactly equal: a job that failed to run yesterday must
  // still post today rather than skipping the month (NFR-07, NFR-11).
  return definition.active && definition.next_run_date <= onDate;
}

function format(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
