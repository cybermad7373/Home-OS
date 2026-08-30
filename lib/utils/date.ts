/**
 * Every date fact in the domain — which day a chore belongs to, which month an
 * expense falls in — is evaluated in the house's timezone, while every stored
 * timestamp is UTC (NFR-10).
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** The calendar date, in the house's timezone, as an ISO `YYYY-MM-DD` string. */
export function houseToday(timezone = DEFAULT_TIMEZONE, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * The Monday on or before a date. Every week in HouseOS starts on one — the
 * effort ledger's `week_start`, the schedule, the Calendar's week view and the
 * insights buckets all agree on it.
 *
 * This is the only implementation. It had grown three copies in three modules,
 * and a house whose chore was scored in one week and reported in another is
 * exactly what that duplication costs.
 */
export function weekStartOf(isoDate: string): string {
  // Noon rather than midnight keeps the arithmetic clear of every DST edge.
  const date = new Date(`${isoDate}T12:00:00Z`);
  const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoDayOfWeek - 1));
  return date.toISOString().slice(0, 10);
}

/** The Monday after the one a date falls in. */
export function nextWeekStart(isoDate: string): string {
  const monday = new Date(`${weekStartOf(isoDate)}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday.toISOString().slice(0, 10);
}

/** Formats an ISO date for display, e.g. "Mon 24 Aug". */
export function formatDate(
  isoDate: string,
  timezone = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, ...options }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
}

/** Formats a stored timestamptz for display in the house's timezone. */
export function formatDateTime(iso: string, timezone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "2h ago", "3d ago" — used on confirmation queues and activity rows. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  let value = seconds;
  for (const [unit, size] of units) {
    if (Math.abs(value) < size) return formatter.format(-Math.round(value), unit);
    value /= size;
  }
  return formatter.format(-Math.round(value), "year");
}
