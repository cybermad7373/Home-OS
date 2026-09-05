/**
 * The sentence to put in front of somebody when a request was refused.
 *
 * The API answers a failed validation with `error.details.fields` — a map of
 * field name to the reason that field was rejected — and `error.message`, which
 * for a validation failure is the catalogue's generic "Check the highlighted
 * fields". Most screens read only the message, so a room saved with a negative
 * rent was refused with "Check the highlighted fields" and nothing highlighted:
 * technically true, useless, and indistinguishable from a bug.
 *
 * The field reason is the specific one, so it wins. The message is the fallback,
 * and the caller's own words are the floor beneath that.
 */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error as
    | {
        message?: unknown;
        details?: { fields?: Record<string, unknown> } | null;
      }
    | undefined;

  const fields = error?.details?.fields;
  if (fields) {
    const first = Object.values(fields).find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (first) return first;
  }

  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}
