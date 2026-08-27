import { z } from "zod";
import { isoDateSchema, rupeeStringSchema } from "./common";

/** Section 2.5 of docs/09-BUSINESS-RULES.md, plus BR-080 to BR-094. */

export const splitBasisSchema = z.enum([
  "equal",
  "room_rent",
  "custom",
  // Pot mode: the whole amount sits on whoever paid, so the expense is
  // recorded and budgeted against without creating a debt.
  "payer",
]);

/** BR-080 — greater than zero, at most ₹10,00,000. */
export const expenseAmountSchema = rupeeStringSchema.refine((value) => {
  const amount = Number(value);
  return amount > 0 && amount <= 1000000;
}, "Enter an amount between ₹0.01 and ₹10,00,000");

export const customShareSchema = z.object({
  member_id: z.string().uuid(),
  amount: rupeeStringSchema,
});

export const createExpenseSchema = z
  .object({
    amount: expenseAmountSchema,
    category_id: z.string().uuid("Pick a category"),
    expense_date: isoDateSchema,
    description: z.string().trim().max(200).optional().or(z.literal("")),
    split_basis: splitBasisSchema.default("equal"),
    paid_by_member_id: z.string().uuid().optional(),
    // The path inside the private receipts bucket: {house_id}/{uuid}.{ext}.
    // Not a URL — a signed one is minted per view and never stored.
    receipt_url: z
      .string()
      .regex(
        /^[0-9a-fA-F-]{36}\/[\w.-]{1,80}$/,
        "That receipt reference does not look right",
      )
      .optional()
      .or(z.literal("")),
    custom_shares: z.array(customShareSchema).optional(),
  })
  .refine(
    (value) =>
      value.split_basis !== "custom" ||
      (value.custom_shares !== undefined && value.custom_shares.length > 0),
    { message: "A custom split needs at least one share", path: ["custom_shares"] },
  );

/** The live preview under the Save button, before anything is written. */
export const previewSplitSchema = z.object({
  amount: expenseAmountSchema,
  expense_date: isoDateSchema,
  split_basis: splitBasisSchema.default("equal"),
  custom_shares: z.array(customShareSchema).optional(),
  paid_by_member_id: z.uuid().optional(),
});

export const approveExpenseSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});

export const voidExpenseSchema = z.object({
  reason: z.string().trim().min(3, "Say why — the record keeps this").max(200),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name the category").max(30),
  icon: z.string().trim().max(8).optional().or(z.literal("")),
  monthly_budget: rupeeStringSchema.optional().or(z.literal("")),
  active: z.boolean().optional(),
});

export const categoryUpdateSchema = categorySchema
  .partial()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update",
  );

export const recurringSchema = z.object({
  name: z.string().trim().min(1, "Name it").max(40),
  amount: expenseAmountSchema,
  category_id: z.string().uuid(),
  paid_by_member_id: z.string().uuid().optional(),
  split_basis: splitBasisSchema.default("equal"),
  // BR-096 — capped at 28 so that no month is too short for it.
  day_of_month: z.coerce.number().int().min(1).max(28),
  auto_approve: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const recurringUpdateSchema = recurringSchema
  .partial()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to update",
  );

export const expenseFilterSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  category: z.string().uuid().optional(),
  member: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(0).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type RecurringInput = z.infer<typeof recurringSchema>;
