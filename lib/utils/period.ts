/**
 * A `YYYY-MM` period, written the way a person says it.
 *
 * This lived in `components/expenses/expense-list.tsx`, which carries
 * `"use client"` — so the moment a server component imported it, Next refused:
 * "Attempted to call monthLabel() from the server but monthLabel is on the
 * client." The Settle screen is a server component, and it wanted the same
 * words the Money screen uses. A pure function of a string belongs in neither
 * a client component nor a server one.
 */
export function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
