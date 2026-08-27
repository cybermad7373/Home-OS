import { z } from "zod";

/** Section 6 of docs/11-NOTIFICATIONS-SPEC.md, plus NT-05. */

/** "23:00" or "23:00:00" — Postgres hands back the second form. */
const clockSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a time like 23:00");

export const notificationPrefsSchema = z
  .object({
    chore_reminders: z.boolean().optional(),
    confirmation_requests: z.boolean().optional(),
    chore_outcomes: z.boolean().optional(),
    house_activity: z.boolean().optional(),
    expense_activity: z.boolean().optional(),
    weekly_digest: z.boolean().optional(),
    // Settlement is deliberately absent. It is not a preference — a member who
    // has muted the app cannot then claim they were never told they owed money.
    quiet_hours_start: clockSchema.optional().nullable(),
    quiet_hours_end: clockSchema.optional().nullable(),
    quiet_hours_off: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.quiet_hours_off === true ||
      (value.quiet_hours_start === undefined) === (value.quiet_hours_end === undefined),
    { message: "Set both ends of quiet hours, or turn them off", path: ["quiet_hours_end"] },
  );

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

/**
 * A `PushSubscription` as `toJSON()` produces it. The keys are base64url and
 * fixed-length by the spec, but they are checked for shape rather than length,
 * because a browser that pads them differently is not a reason to refuse a
 * device.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
  // Where the subscription was made. The native app sends its own value; a
  // browser sends nothing and gets the default, which is what it is.
  platform: z.enum(["web", "android", "ios"]).default("web"),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

export const markReadSchema = z.object({
  /** Omitted means "everything", which is what the Mark all read button sends. */
  id: z.string().uuid().optional(),
});

export const feedQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unread: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === true || value === "true"),
});
