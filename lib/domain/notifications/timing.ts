/**
 * When a notification is allowed to arrive — docs/11-NOTIFICATIONS-SPEC.md
 * section 3.
 *
 * Two rules, and they compose in this order:
 *
 *   1. **Availability.** A reminder must arrive when the member can act on it.
 *      A 09:00 reminder for an evening chore, sent to somebody who is at work,
 *      is how notifications become noise and then become uninstalled.
 *   2. **Quiet hours.** Nothing wakes anybody except settlement, which is
 *      exempt because a member who is owed money should learn it when it
 *      happens.
 *
 * Everything here works in minutes since midnight of a reference date, and
 * values are allowed past 1440 to mean "the following day". That is what lets
 * a 23:30 reminder resolve to 07:00 tomorrow without any date arithmetic
 * leaking into the rule, and it is why this file has no `Date` in it.
 */

export const MINUTES_PER_DAY = 1440;

/** The lead time in front of a window (section 3.1). */
export const REMINDER_LEAD_MIN = 30;

/** How long after a member gets home before they are bothered. */
export const SETTLE_IN_MIN = 5;

/** Section 2.1, N-03: the second reminder, before the deadline. */
export const DEADLINE_REMINDER_LEAD_MIN = 120;

export interface QuietHours {
  /** Minutes since midnight, e.g. 23:00 -> 1380. */
  startMin: number;
  /** Minutes since midnight, e.g. 07:00 -> 420. */
  endMin: number;
}

/** The house default from section 3.2, expressed once. */
export const DEFAULT_QUIET_HOURS: QuietHours = { startMin: 23 * 60, endMin: 7 * 60 };

function minuteOfDay(minute: number): number {
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function dayIndex(minute: number): number {
  return Math.floor(minute / MINUTES_PER_DAY);
}

/**
 * True when the instant falls inside quiet hours.
 *
 * Quiet hours normally wrap midnight, which is the whole reason this is a
 * function and not a comparison. Equal start and end means the member has
 * turned quiet hours off — not that they are quiet for every minute of the day.
 */
export function inQuietHours(minute: number, quiet: QuietHours | null): boolean {
  if (!quiet) return false;
  const start = minuteOfDay(quiet.startMin);
  const end = minuteOfDay(quiet.endMin);
  if (start === end) return false;

  const at = minuteOfDay(minute);
  return start < end ? at >= start && at < end : at >= start || at < end;
}

/**
 * The first instant at or after `minute` that is outside quiet hours.
 *
 * Returns `minute` itself when it is already allowed, so it is safe to call
 * unconditionally.
 */
export function nextAllowedMinute(minute: number, quiet: QuietHours | null): number {
  if (!inQuietHours(minute, quiet)) return minute;

  const { startMin, endMin } = quiet as QuietHours;
  const start = minuteOfDay(startMin);
  const end = minuteOfDay(endMin);
  const day = dayIndex(minute);
  const at = minuteOfDay(minute);

  // Wrapping quiet hours: an instant in the late-evening half ends tomorrow
  // morning; one in the early-morning half ends the same morning.
  if (start > end && at >= start) return (day + 1) * MINUTES_PER_DAY + end;
  return day * MINUTES_PER_DAY + end;
}

export interface ReminderInput {
  /** Minutes since midnight of the chore's date. */
  windowStartMin: number;
  /** Same basis; may exceed 1440 when a window runs past midnight. */
  deadlineMin: number;
  /**
   * When the member gets home on that date, or null when they are home all
   * day. Minutes since midnight of the same date.
   */
  returnsAtMin: number | null;
  quiet: QuietHours | null;
}

/**
 * `reminderTime` from section 3.1, in the spec's own order.
 *
 * The worked example: Suresh returns at 22:00, his window is 22:00–23:00 and
 * the deadline is 23:00. The naive 21:30 would reach him mid-commute; the
 * return-time rule moves it to 22:05.
 *
 * The final clamp is the one that surprises people. If every adjustment has
 * pushed the reminder past the deadline, the reminder is not dropped — it is
 * pulled back to the window start, because a late reminder about a chore that
 * can still be done is worth more than silence. The dispatcher's own quiet-hour
 * filter is what stops that clamp from ringing a phone at 03:00.
 */
export function reminderTime(input: ReminderInput): number {
  const { windowStartMin, deadlineMin, returnsAtMin, quiet } = input;

  let candidate = windowStartMin - REMINDER_LEAD_MIN;

  if (returnsAtMin !== null && candidate < returnsAtMin) {
    candidate = returnsAtMin + SETTLE_IN_MIN;
  }

  candidate = nextAllowedMinute(candidate, quiet);

  if (candidate > deadlineMin) {
    candidate = windowStartMin;
  }

  return candidate;
}

/**
 * The second reminder of section 5 — "one before the window, one before the
 * deadline". Returns null when it would land at or before the first one, which
 * is what keeps a short window from producing two notifications a minute apart.
 */
export function deadlineReminderTime(
  input: ReminderInput,
  firstReminderMin: number,
): number | null {
  const candidate = nextAllowedMinute(
    input.deadlineMin - DEADLINE_REMINDER_LEAD_MIN,
    input.quiet,
  );
  if (candidate <= firstReminderMin) return null;
  if (candidate >= input.deadlineMin) return null;
  return candidate;
}

/** Section 4: `later` reschedules an hour on, at most twice. */
export const SNOOZE_MIN = 60;
export const MAX_SNOOZES = 2;

export function snoozeTime(
  currentMin: number,
  snoozesUsed: number,
  quiet: QuietHours | null,
): number | null {
  if (snoozesUsed >= MAX_SNOOZES) return null;
  return nextAllowedMinute(currentMin + SNOOZE_MIN, quiet);
}

/** "23:00" or "23:00:00" -> 1380. */
export function parseClock(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function formatClock(minute: number): string {
  const at = minuteOfDay(minute);
  const hours = Math.floor(at / 60);
  return `${String(hours).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
}

export function quietHoursFrom(
  start: string | null | undefined,
  end: string | null | undefined,
): QuietHours | null {
  const startMin = parseClock(start);
  const endMin = parseClock(end);
  if (startMin === null || endMin === null) return null;
  return { startMin, endMin };
}
