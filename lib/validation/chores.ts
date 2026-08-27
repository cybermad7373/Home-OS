import { z } from "zod";
import { isoDateSchema } from "./common";

/** Section 2.4 of docs/09-BUSINESS-RULES.md, plus CH-01 to CH-11. */

export const choreCategorySchema = z.enum([
  "room_cleaning",
  "cooking",
  "kitchen_cleaning",
  "bathroom_cleaning",
  "common_cleaning",
  "mopping",
  "other",
]);

export const choreSlotSchema = z.enum(["morning", "evening", "any"]);
export const choreScopeSchema = z.enum(["house", "room"]);
export const choreFrequencySchema = z.enum(["daily", "weekly", "times_per_week"]);

export const choreTemplateSchema = z
  .object({
    name: z.string().trim().min(1, "Name the chore").max(40),
    category: choreCategorySchema,
    // The slider on the admin screen runs 5 to 50, with the anchors from the
    // UI spec: 5 "a minute", 15 "quick", 30 "a real job", 50 "the worst one".
    effort_points: z.coerce
      .number()
      .int()
      .min(1, "Points must be between 1 and 50")
      .max(50, "Points must be between 1 and 50"),
    duration_min: z.coerce
      .number()
      .int()
      .min(1, "Give it a realistic duration")
      .max(240, "Nothing in a house takes four hours"),
    slot: choreSlotSchema.default("any"),
    scope: choreScopeSchema.default("house"),
    room_id: z.string().uuid().optional().nullable(),
    frequency: choreFrequencySchema,
    times_per_week: z.coerce.number().int().min(1).max(7).optional().nullable(),
    requires_cooking_skill: z.boolean().optional(),
    is_heavy: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) => value.scope !== "room" || Boolean(value.room_id),
    { message: "A room chore needs a room", path: ["room_id"] },
  )
  .refine(
    (value) => value.frequency !== "times_per_week" || Boolean(value.times_per_week),
    { message: "Say how many times a week", path: ["times_per_week"] },
  );

export const choreTemplateUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    category: choreCategorySchema.optional(),
    effort_points: z.coerce.number().int().min(1).max(50).optional(),
    duration_min: z.coerce.number().int().min(1).max(240).optional(),
    slot: choreSlotSchema.optional(),
    scope: choreScopeSchema.optional(),
    room_id: z.string().uuid().nullable().optional(),
    frequency: choreFrequencySchema.optional(),
    times_per_week: z.coerce.number().int().min(1).max(7).nullable().optional(),
    requires_cooking_skill: z.boolean().optional(),
    is_heavy: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update",
  );

export const markDoneSchema = z.object({
  photo_url: z.string().max(300).optional(),
});

export const rejectChoreSchema = z.object({
  // A rejection without a reason is just a veto, and a veto is the failure mode
  // the whole confirmation mechanism is designed to prevent.
  reason: z.string().trim().min(3, "Say what was wrong with it").max(200),
});

export const swapRequestSchema = z.object({
  to_member_id: z.string().uuid(),
  message: z.string().trim().max(200).optional(),
});

export const swapResponseSchema = z.object({
  accept: z.boolean(),
});

export const generateWeekSchema = z.object({
  week_start: isoDateSchema.optional(),
  dry_run: z.boolean().optional().default(false),
});

export type ChoreTemplateInput = z.infer<typeof choreTemplateSchema>;
