import { z } from "zod";

/**
 * The Calendar's query parameters — docs/05-API-SPEC.md section 11.
 *
 * Three shapes, each validated rather than trusted: a malformed date reaching
 * a range read turns into an empty answer that looks like a quiet Home rather
 * than a bad request.
 */

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-08-26")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Use a real date");

export const calendarPeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-08");
