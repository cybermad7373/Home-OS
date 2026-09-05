import type { Metadata } from "next";
import { redirect } from "next/navigation";

/*
  A redirect still gets a title and a description. It costs nothing, and a
  page in this tree without them is indistinguishable from one that was
  forgotten — which is how three of them ended up with neither.
*/
export const metadata: Metadata = {
  title: "Money",
  description:
    "Everything the home has spent this month, who paid for it, and what your share of it is.",
};

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
