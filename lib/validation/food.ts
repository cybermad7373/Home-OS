import { z } from "zod";

/**
 * Food request bodies — docs/15-FOOD-SPEC.md.
 *
 * Add Meal asks for almost nothing: a name and a date is a valid meal
 * (section 8.1). Everything else is optional and below the fold, which this
 * schema mirrors by defaulting rather than requiring.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date");
const paise = z.number().int().min(0);

export const mealSourceSchema = z.enum(["home_cooked", "bought", "ordered", "other"]);
export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack", "other"]);
export const foodRatingSchema = z.enum(["like", "okay", "dislike"]);
export const restrictionSeveritySchema = z.enum(["allergy", "intolerance", "diet"]);

const mealParticipantSchema = z
  .object({
    memberId: z.string().uuid().optional(),
    guestId: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (value) => [value.memberId, value.guestId, value.label].filter((v) => v !== undefined).length === 1,
    { message: "Exactly one of memberId, guestId or label identifies a participant" },
  );

const mealItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().max(60).optional(),
  costPaise: paise.optional(),
});

/** Section 8.1: name and date first, everything else below the fold. */
export const createMealSchema = z.object({
  name: z.string().trim().min(1, "Name it").max(120),
  mealDate: isoDate,
  participants: z.array(mealParticipantSchema).default([]),
  source: mealSourceSchema.default("home_cooked"),
  mealType: mealTypeSchema.default("other"),
  baseCostPaise: paise.default(0),
  prepCostPaise: paise.default(0),
  deliveryCostPaise: paise.default(0),
  otherCostPaise: paise.default(0),
  items: z.array(mealItemSchema).default([]),
  foodId: z.string().uuid().optional(),
  expenseId: z.string().uuid().optional(),
  saveToLibrary: z.boolean().default(false),
  recipeInstructions: z.string().trim().max(4000).optional(),
  photoUrl: z.string().url().optional(),
  note: z.string().trim().max(1000).optional(),
});

export type CreateMealInput = z.infer<typeof createMealSchema>;

export const updateFoodPreferenceSchema = z
  .object({
    foodId: z.string().uuid().optional(),
    itemName: z.string().trim().min(1).max(120).optional(),
    rating: foodRatingSchema,
  })
  .refine(
    (value) => [value.foodId, value.itemName].filter((v) => v !== undefined).length === 1,
    { message: "Rate either a library food or an ingredient, not both" },
  );

export type UpdateFoodPreferenceInput = z.infer<typeof updateFoodPreferenceSchema>;

export const createRestrictionSchema = z.object({
  memberId: z.string().uuid(),
  itemName: z.string().trim().min(1, "Name what to avoid").max(120),
  severity: restrictionSeveritySchema,
  note: z.string().trim().max(500).optional(),
});

export type CreateRestrictionInput = z.infer<typeof createRestrictionSchema>;

export const mergeFoodsSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

export type MergeFoodsInput = z.infer<typeof mergeFoodsSchema>;

export const createMealPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  plannedDate: isoDate,
  foodId: z.string().uuid().optional(),
});

export type CreateMealPlanInput = z.infer<typeof createMealPlanSchema>;

/** Confirming a plan as eaten takes exactly what create_meal needs, minus the name/date/food_id it already has. */
export const confirmMealPlanSchema = z.object({
  participants: z.array(mealParticipantSchema).default([]),
  source: mealSourceSchema.default("home_cooked"),
  mealType: mealTypeSchema.default("other"),
  baseCostPaise: paise.default(0),
  prepCostPaise: paise.default(0),
  deliveryCostPaise: paise.default(0),
  otherCostPaise: paise.default(0),
  items: z.array(mealItemSchema).default([]),
  expenseId: z.string().uuid().optional(),
});

export type ConfirmMealPlanInput = z.infer<typeof confirmMealPlanSchema>;

export const linkMealExpenseSchema = z.object({
  expenseId: z.string().uuid(),
});

export type LinkMealExpenseInput = z.infer<typeof linkMealExpenseSchema>;
