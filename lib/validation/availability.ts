import { z } from "zod";
import { isoDateSchema } from "./common";

/** Section 2.5 of docs/09-BUSINESS-RULES.md — AV-01 to AV-06. */

/** "09:30", stored as a `time`. Seconds are never meaningful here. */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30");

/**
 * One weekday's pattern.
 *
 * A blank leaving or returning time means home from the start of the day, or
 * until the end of it. BR-021: a return must be after a departure — an
 * overnight shift is `is_home: false`, not a window that wraps midnight, and
 * the same check exists as a table constraint.
 */
export const availabilityDaySchema = z
  .object({
    day_of_week: z.coerce.number().int().min(0).max(6),
    is_home: z.boolean(),
    leaves_at: clockTimeSchema.nullable().optional(),
    returns_at: clockTimeSchema.nullable().optional(),
  })
  .refine(
    (day) =>
      !day.is_home ||
      !day.leaves_at ||
      !day.returns_at ||
      day.returns_at > day.leaves_at,
    {
      message: "You cannot get back before you left. An overnight shift is 'away'.",
      path: ["returns_at"],
    },
  );

/**
 * The whole week, in one write.
 *
 * Seven rows, one per day, and the days must be distinct — a partial pattern is
 * refused rather than merged, because a member who submits four days and
 * believes they submitted seven is exactly the member the scheduler will treat
 * as home all day on the missing three (BR-020).
 */
export const availabilityWeekSchema = z
  .object({
    days: z.array(availabilityDaySchema).length(7, "Give all seven days"),
  })
  .refine(
    (value) => new Set(value.days.map((day) => day.day_of_week)).size === 7,
    { message: "Each day of the week exactly once", path: ["days"] },
  );

export const exceptionTypeSchema = z.enum(["away", "home_all_day", "custom_hours"]);

export const availabilityExceptionSchema = z
  .object({
    exc_date: isoDateSchema,
    exc_type: exceptionTypeSchema,
    leaves_at: clockTimeSchema.nullable().optional(),
    returns_at: clockTimeSchema.nullable().optional(),
    reason: z.string().trim().max(120).optional(),
  })
  .refine(
    (value) =>
      value.exc_type !== "custom_hours" ||
      Boolean(value.leaves_at) ||
      Boolean(value.returns_at),
    {
      message: "Custom hours need a leaving or a returning time",
      path: ["leaves_at"],
    },
  )
  .refine(
    (value) =>
      !value.leaves_at || !value.returns_at || value.returns_at > value.leaves_at,
    { message: "You cannot get back before you left", path: ["returns_at"] },
  );

/** Section 2.6 of docs/09-BUSINESS-RULES.md. */
export const guestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter the guest's name")
      .max(50, "Enter the guest's name"),
    from_date: isoDateSchema,
    to_date: isoDateSchema,
    counts_for_expense: z.boolean().optional().default(true),
    is_assignable: z.boolean().optional().default(true),
  })
  .refine((value) => value.to_date >= value.from_date, {
    message: "The last night cannot be before the first",
    path: ["to_date"],
  })
  // A stay longer than a month is somebody moving in, and somebody moving in
  // is a member with a target, not a visitor billed to a host.
  .refine((value) => daysBetween(value.from_date, value.to_date) <= 30, {
    message: "A guest stay can be at most 30 days",
    path: ["to_date"],
  });

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/**
 * Registration is allowed a week of hindsight and no more.
 *
 * Somebody who forgot to register Saturday's visitor on Saturday should still
 * be able to on Monday — the alternative is a head count that quietly
 * under-counts. Beyond a week it stops being a correction and becomes a way to
 * revisit a split after seeing it, which is what BR-115 exists to prevent.
 */
export function guestDatesInRange(
  input: { from_date: string; to_date: string },
  today: string,
): boolean {
  return daysBetween(input.from_date, today) <= 7 && input.to_date >= addDays(today, -7);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type AvailabilityDayInput = z.infer<typeof availabilityDaySchema>;
export type AvailabilityWeekInput = z.infer<typeof availabilityWeekSchema>;
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionSchema>;
export type GuestInput = z.infer<typeof guestSchema>;
