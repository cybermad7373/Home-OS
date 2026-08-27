import {
  DAY_END_MIN,
  DAY_START_MIN,
  MIN_BUFFER_MIN,
  type AvailabilityWindow,
  type ChoreSlot,
  type SchedulingMember,
  type WeekWindows,
  type WindowKind,
} from "./types";

/**
 * Availability windows — docs/06-ALGORITHMS.md section 1.
 *
 * Turning "I leave about nine and get back about seven" into assignable
 * capacity. The point of this file is stated in the design decisions and worth
 * repeating, because it is the rule people argue about:
 *
 *   **Low availability changes which chores you get. It never changes how many
 *   points you owe.**
 *
 * A member who is out twelve hours a day gets weekend-weighted work, not less
 * work. Capacity is used for the feasibility check and as a tie-break, and for
 * nothing else. It is deliberately absent from `computeTargets`.
 */

export interface DayAvailability {
  /** 0 = Sunday, matching Postgres and the availability table. */
  dayOfWeek: number;
  isHome: boolean;
  /** Minutes since midnight; null means home all day. */
  leavesAtMin: number | null;
  returnsAtMin: number | null;
}

export type ExceptionType = "away" | "home_all_day" | "custom_hours";

export interface AvailabilityException {
  date: string;
  type: ExceptionType;
  leavesAtMin: number | null;
  returnsAtMin: number | null;
}

/** "09:30" -> 570. Returns null for null, so callers can pass straight through. */
export function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 0 = Sunday, from an ISO date, in a way that does not drift by timezone. */
export function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

const FULL_DAY: AvailabilityWindow = {
  kind: "full",
  startMin: DAY_START_MIN,
  endMin: DAY_END_MIN,
};

/**
 * The windows a member has on one date.
 *
 * An exception overrides the weekday pattern entirely — that is the whole point
 * of an exception. Windows shorter than the buffer are dropped rather than
 * offered, because a fifteen-minute gap is not capacity, it is a coincidence.
 */
export function windowsForDate(
  isoDate: string,
  weekday: DayAvailability | undefined,
  exception?: AvailabilityException,
): AvailabilityWindow[] {
  if (exception?.type === "away") return [];
  if (exception?.type === "home_all_day") return [FULL_DAY];

  const leavesAtMin = exception?.leavesAtMin ?? weekday?.leavesAtMin ?? null;
  const returnsAtMin = exception?.returnsAtMin ?? weekday?.returnsAtMin ?? null;

  // No pattern recorded at all: BR-020 says treat them as home all day and
  // prompt them to correct it. Assuming they are out would quietly excuse them
  // from work, which is the failure this product exists to prevent.
  if (!weekday && !exception) return [FULL_DAY];
  if (weekday && !weekday.isHome && !exception) return [];
  if (leavesAtMin === null && returnsAtMin === null) return [FULL_DAY];

  const windows: AvailabilityWindow[] = [];
  if (leavesAtMin !== null && leavesAtMin > DAY_START_MIN) {
    windows.push({ kind: "morning", startMin: DAY_START_MIN, endMin: leavesAtMin });
  }
  if (returnsAtMin !== null && returnsAtMin < DAY_END_MIN) {
    windows.push({ kind: "evening", startMin: returnsAtMin, endMin: DAY_END_MIN });
  }

  return windows.filter((window) => window.endMin - window.startMin >= MIN_BUFFER_MIN);
}

/** Every date in the week, as ISO strings, starting from the Monday. */
export function weekDates(weekStart: string): string[] {
  const start = new Date(`${weekStart}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

/**
 * A member's whole week of windows.
 *
 * Phase 4 calls this with no availability rows, which yields a full day
 * everywhere — the roadmap's deliberate simplification, so the lifecycle can be
 * validated in real use before the harder scheduling problem lands.
 */
export function buildWeekWindows(
  weekStart: string,
  weekdays: DayAvailability[],
  exceptions: AvailabilityException[] = [],
): WeekWindows {
  const byDayOfWeek = new Map(weekdays.map((day) => [day.dayOfWeek, day]));
  const byDate = new Map(exceptions.map((exception) => [exception.date, exception]));

  const windows: WeekWindows = new Map();
  for (const date of weekDates(weekStart)) {
    windows.set(
      date,
      windowsForDate(date, byDayOfWeek.get(dayOfWeek(date)), byDate.get(date)),
    );
  }
  return windows;
}

export function slotMatches(kind: WindowKind, slot: ChoreSlot): boolean {
  if (kind === "full") return true;
  if (slot === "any") return true;
  return kind === slot;
}

/** HC-1 — is there a window long enough, in the right part of the day? */
export function fits(
  windows: AvailabilityWindow[],
  slot: ChoreSlot,
  durationMin: number,
): boolean {
  return windows.some(
    (window) =>
      slotMatches(window.kind, slot) &&
      window.endMin - window.startMin >= durationMin + MIN_BUFFER_MIN,
  );
}

/** Total free minutes in the week. A tie-break (SO-5), never a target input. */
export function weeklyCapacityMinutes(windows: WeekWindows): number {
  let total = 0;
  for (const dayWindows of windows.values()) {
    for (const window of dayWindows) {
      total += window.endMin - window.startMin;
    }
  }
  return total;
}

/** Which days a member's residency actually covers. */
export function residencyCoversDate(
  member: SchedulingMember,
  isoDate: string,
): boolean {
  if (member.joinedDate > isoDate) return false;
  if (member.leftDate !== null && member.leftDate < isoDate) return false;

  const weekend = dayOfWeek(isoDate) === 0 || dayOfWeek(isoDate) === 6;
  if (member.residency === "weekday_only") return !weekend;
  if (member.residency === "weekend_only") return weekend;
  return true;
}

/** Days a member is actually around this week. Feeds the target weighting. */
export function presentDays(
  member: SchedulingMember,
  weekStart: string,
  exceptions: AvailabilityException[] = [],
): number {
  const away = new Set(
    exceptions.filter((exception) => exception.type === "away").map((e) => e.date),
  );

  return weekDates(weekStart).filter(
    (date) => residencyCoversDate(member, date) && !away.has(date),
  ).length;
}
