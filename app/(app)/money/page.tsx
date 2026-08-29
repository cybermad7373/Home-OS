import { redirect } from "next/navigation";

/**
 * `/money` is the Money tab's documented route (docs/08-UI-UX-SPEC.md section
 * 3.1). The screen behind it is the expense ledger that has been at
 * `/expenses` since phase 2, along with everything that hangs off it —
 * approvals, recurring, close and settle.
 *
 * Renaming the whole family for the sake of the tab's label would break every
 * link the Home has already shared and every bookmark on it, and would buy
 * nothing a redirect does not. So the documented URL works, and `/expenses`
 * stays canonical.
 */
export default function MoneyPage() {
  redirect("/expenses");
}
