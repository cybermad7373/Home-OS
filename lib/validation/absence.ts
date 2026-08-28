import { z } from "zod";

/**
 * Absence request bodies — docs/01-BRD.md AV-05, docs/05-API-SPEC.md.
 *
 * The range rules are checked here and again by the constraints in migration
 * 057. This copy exists so a person filling in a form is told before they send
 * it; that copy exists because the database is the one that still holds when
 * the caller is not this application.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date");

const dateRange = {
  from_date: isoDate,
  to_date: isoDate,
};

/** 120 days is `absence_range_bounded`. Longer than that is a member leaving. */
const rangeOrdered = <T extends { from_date: string; to_date: string }>(
  value: T,
  context: z.RefinementCtx,
) => {
  if (value.to_date < value.from_date) {
    context.addIssue({
      code: "custom",
      path: ["to_date"],
      message: "The last day cannot be before the first",
    });
    return;
  }

  const days =
    (Date.parse(`${value.to_date}T12:00:00Z`) -
      Date.parse(`${value.from_date}T12:00:00Z`)) /
    86_400_000;

  if (days > 120) {
    context.addIssue({
      code: "custom",
      path: ["to_date"],
      message: "Longer than four months is leaving, not time away",
    });
  }
};

export const absenceSchema = z
  .object({
    ...dateRange,
    reason: z.string().trim().min(3, "Say why").max(500).optional(),
  })
  .superRefine(rangeOrdered);

/** The AV-08 sheet: the range and nothing else, because it writes nothing. */
export const absencePreviewSchema = z.object(dateRange).superRefine(rangeOrdered);

export type AbsenceInput = z.infer<typeof absenceSchema>;
export type AbsencePreviewInput = z.infer<typeof absencePreviewSchema>;
