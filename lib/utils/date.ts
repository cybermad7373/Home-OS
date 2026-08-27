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
