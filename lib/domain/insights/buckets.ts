/**
 * Time bucketing shared by every insight type (IN-01..IN-08).
 *
 * Pure: ISO date strings in, ISO date strings out. No clock, no timezone, no
 * database. The caller has already resolved "now" in the house's timezone
 * before it gets here, so nothing in this file can disagree with the rest of
 * the app about which day it is.
 *
 * A week bucket starts on **Monday**, matching `weekStartOf` in
 * lib/data/chores and the effort ledger's `week_start`. Sunday-start weeks
 * would put the same chore in a different bucket from the one it was scored
 * in, and the two figures would never reconcile.
 */

import { weekStartOf as mondayOf } from "@/lib/utils/date";

export type Granularity = "day" | "week" | "month";

export const GRANULARITIES: Granularity[] = ["day", "week", "month"];

/**
 * A hard stop on bucket generation. Twelve months of days is 366; this leaves
 * room for a year and refuses anything beyond it rather than building a list
 * the screen cannot render. Every range the API accepts is far below it.
 */
const MAX_BUCKETS = 400;

function asDate(isoDate: string): Date {
  // Noon UTC, not midnight: it keeps the arithmetic clear of every DST edge,
  // and only the date half is ever read back out.
  return new Date(`${isoDate}T12:00:00Z`);
}

function asIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday of the ISO week a date falls in — one implementation, shared. */
export { weekStartOf } from "@/lib/utils/date";

/**
 * The bucket a date belongs to. Day and week buckets are `YYYY-MM-DD`; a month
 * bucket is `YYYY-MM`, so the key sorts and reads the way a period does
 * everywhere else in the app.
 */
export function bucketKeyOf(isoDate: string, granularity: Granularity): string {
  switch (granularity) {
    case "day":
      return isoDate.slice(0, 10);
    case "week":
      return mondayOf(isoDate);
    case "month":
      return isoDate.slice(0, 7);
  }
}

/** The bucket after this one, in the same key format. */
export function nextBucket(key: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const date = asDate(key);
  date.setUTCDate(date.getUTCDate() + (granularity === "week" ? 7 : 1));
  return asIso(date);
}

/**
 * Every bucket from `from` to `to` inclusive, oldest first, with no gaps — a
 * week the house recorded nothing still gets a bucket, because a chart with a
 * missing bar reads as a shorter month rather than a quiet one.
 *
 * Returns `[]` when the range is empty or inverted, which is what an insight
 * over a house with no records should show.
 */
export function bucketsBetween(from: string, to: string, granularity: Granularity): string[] {
  if (!from || !to) return [];

  const start = bucketKeyOf(from, granularity);
  const end = bucketKeyOf(to, granularity);
  if (start > end) return [];

  const keys: string[] = [];
  let current = start;
  while (current <= end && keys.length < MAX_BUCKETS) {
    keys.push(current);
    current = nextBucket(current, granularity);
  }
  return keys;
}

/**
 * Change against the bucket before, as a whole-number percentage.
 *
 * `null` when there is nothing to compare against — a category's first month
 * has not gone up by 100%, it has no history, and a chart that claims
 * otherwise is the kind of number a house argues about.
 */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
