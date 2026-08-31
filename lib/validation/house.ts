import { z } from "zod";
import {
  displayNameSchema,
  emailSchema,
  identifierSchema,
  memberRoleSchema,
  passwordSchema,
  phoneSchema,
  usernameSchema,
  residencySchema,
  rupeeStringSchema,
  upiVpaSchema,
} from "./common";

export const signUpSchema = z.object({
  display_name: displayNameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** Sign in with a username or an email — the route works out which. */
export const signInSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, "Enter your password"),
});

export const claimUsernameSchema = z.object({
  username: usernameSchema,
});

export const homeTypeSchema = z.enum(["shared", "family"]);
export const moneyModeSchema = z.enum(["split", "pot"]);
export const effortModeSchema = z.enum(["points", "rota"]);

/**
 * Location is optional in every part and is used as context for food
 * suggestions and nothing else (HM-03, SEC-18). Nothing here is more precise
 * than an area, because nothing needs to be.
 */
export const homeLocationSchema = z.object({
  country_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "Use a two-letter country code")
    .transform((value) => value.toUpperCase())
    .optional(),
  state: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  area: z.string().trim().max(60).optional(),
});

export const createHouseSchema = z.object({
  name: z.string().trim().min(2, "Give the home a name").max(60),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).default("Asia/Kolkata"),
  currency: z.string().trim().length(3).default("INR"),
  // Chooses the defaults for money and effort, and the vocabulary the app uses.
  // Defaulted rather than required so an older client still works.
  home_type: homeTypeSchema.default("shared"),
  location: homeLocationSchema.optional(),
});

export const selectHomeSchema = z.object({
  house_id: z.uuid(),
});

export const joinRequestSchema = z.object({
  message: z.string().trim().max(280).optional(),
});

/**
 * Ten characters, the same floor the governance spec puts on a rejection
 * reason: long enough that "no" has to become a sentence.
 */
export const declineRequestSchema = z.object({
  reason: z.string().trim().min(10, "Say why — the record keeps this").max(280),
});

/**
 * A resident with no login: a child, an elderly parent, anybody the house feeds
 * and does not bill. `shares_cost` false is the common case and is what makes a
 * guardian mandatory — somebody has to be on the hook for that head.
 */
export const dependentSchema = z
  .object({
    name: z.string().trim().min(1, "Give them a name").max(50),
    guardian_member_id: z.uuid("Choose who they belong to").optional(),
    shares_cost: z.boolean().default(false),
    does_chores: z.boolean().default(false),
    residency: residencySchema.default("full_time"),
  })
  .refine(
    (value) => value.shares_cost || value.guardian_member_id !== undefined,
    {
      message: "Somebody has to carry their share",
      path: ["guardian_member_id"],
    },
  );

export const houseSettingsSchema = z
  .object({
    penalty_rate: rupeeStringSchema.optional(),
    expense_approval_threshold: rupeeStringSchema.optional(),
    auto_confirm_hours: z.coerce.number().int().min(1).max(168).optional(),
    schedule_generation_dow: z.coerce.number().int().min(0).max(6).optional(),
    schedule_generation_hour: z.coerce.number().int().min(0).max(23).optional(),
    carry_cap_percent: z.coerce.number().int().min(0).max(100).optional(),
    llm_scheduling_enabled: z.boolean().optional(),
    money_mode: moneyModeSchema.optional(),
    effort_mode: effortModeSchema.optional(),
    penalty_enabled: z.boolean().optional(),
    game_layer_enabled: z.boolean().optional(),
    // An empty string clears it: the house has no daily target.
    daily_budget: rupeeStringSchema.optional().or(z.literal("")),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update",
  );

/**
 * Changed in 2.0: no `status`. A Requested person becomes Active by having
 * their request accepted, and an Active person becomes Inactive through
 * `DELETE /api/members/:id`, which knows about money still owed.
 */
export const updateMemberSchema = z
  .object({
    role: memberRoleSchema.optional(),
    residency: residencySchema.optional(),
    can_cook: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update",
  );

export const updateProfileSchema = z
  .object({
    display_name: displayNameSchema.optional(),
    username: usernameSchema.optional(),
    phone: phoneSchema.optional().or(z.literal("")),
    upi_vpa: upiVpaSchema.optional().or(z.literal("")),
    can_cook: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update",
  );

export const roomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "A room needs a name")
    .max(30, "A room with that name already exists"),
  capacity: z.coerce
    .number()
    .int()
    .min(1, "Capacity must be between 1 and 10")
    .max(10, "Capacity must be between 1 and 10"),
  monthly_rent: rupeeStringSchema.refine(
    (value) => Number(value) <= 500000,
    "Rent looks wrong — check the amount",
  ),
});

export const roomUpdateSchema = roomSchema.partial().refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  "Nothing to update",
);

export const assignRoomSchema = z.object({
  member_id: z.string().uuid(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type CreateHouseInput = z.infer<typeof createHouseSchema>;
export type RoomInput = z.infer<typeof roomSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export { emailSchema, passwordSchema };
