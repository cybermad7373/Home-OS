import { z } from "zod";

/** Section 1.7 of docs/09-BUSINESS-RULES.md. */

export const closePeriodSchema = z.object({
  /**
   * The roadmap's mitigation for the sharpest edge in the product: run the
   * first month with the penalty rate at zero, so everybody sees what they
   * would have owed before any money changes hands.
   */
  shadow_mode: z.boolean().optional().default(false),

  /**
   * Why this month is being closed now. Closing is a Critical decision since
   * D-59, and a Critical decision cannot exist without a reason — the database
   * says so in a check constraint. Optional here because "the month ended" is
   * the true answer almost every time, and the handler supplies it; a person
   * with something more to say may still say it.
   */
  reason: z.string().trim().min(3, "Say why").max(500).optional(),
});

export const markPaidSchema = z.object({
  paid: z.boolean().optional().default(true),
});

export const reopenPeriodSchema = z.object({
  // BR-113 — every reopen is logged with a reason and the admin who did it.
  reason: z.string().trim().min(3, "Say why this month is being reopened").max(200),
});

export const resolveLateSchema = z.object({
  action: z.enum(["carry_forward", "reopen"]),
  reason: z.string().trim().max(200).optional(),
});
