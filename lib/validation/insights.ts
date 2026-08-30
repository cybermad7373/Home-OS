import { z } from "zod";
import { GRANULARITIES, INSIGHT_TYPES } from "@/lib/domain/insights";

/**
 * The insights query parameters — one screen, four types, four filters
 * (docs/07-ROADMAP.md phase 15).
 *
 * Validated rather than coerced. A malformed period silently falling back to
 * "this month" is the failure mode worth avoiding here: the caller asked about
 * one month, got another, and nothing on the screen says so.
 */

export const insightPeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-08");

export const insightDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-08-26")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Use a real date");

export const insightsQuerySchema = z.object({
  type: z.enum(INSIGHT_TYPES).default("money"),
  period: insightPeriodSchema.optional(),
  granularity: z.enum(GRANULARITIES as [string, ...string[]]).default("week"),
  // Twelve is the cap the analytics reports already use; beyond a year the
  // chart stops being readable at 360 px, which is the width that matters.
  months: z.coerce.number().int().min(1).max(12).default(1),
  category: z.uuid().optional(),
  member: z.uuid().optional(),
});

export type InsightsQueryInput = z.infer<typeof insightsQuerySchema>;

/** Every export the Home may take of itself (IN-10) — no tier, no cap. */
export const EXPORT_VIEWS = [
  "money",
  "chores",
  "food",
  "home",
  "position",
  "expenses",
  "budgets",
] as const;
export type ExportView = (typeof EXPORT_VIEWS)[number];

export const exportQuerySchema = z.object({
  view: z.enum(EXPORT_VIEWS).default("money"),
  period: insightPeriodSchema.optional(),
  granularity: z.enum(GRANULARITIES as [string, ...string[]]).default("month"),
  months: z.coerce.number().int().min(1).max(12).default(1),
  category: z.uuid().optional(),
  member: z.uuid().optional(),
});

export const pointBreakdownQuerySchema = z.object({
  member: z.uuid(),
  from: insightDateSchema,
  to: insightDateSchema,
  /** The figure the screen displayed, so the answer can say whether it agrees. */
  points: z.coerce.number().int().min(0).default(0),
});

/** Parses `URLSearchParams` into a plain object Zod can read. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (value !== "") out[key] = value;
  }
  return out;
}
