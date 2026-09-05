import type { Metadata } from "next";
import { redirect } from "next/navigation";

/*
  A redirect still gets a title and a description. It costs nothing, and a
  page in this tree without them is indistinguishable from one that was
  forgotten — which is how three of them ended up with neither.
*/
export const metadata: Metadata = {
  title: "Insights",
  description:
    "Where the home's money and effort actually go, over a range you choose.",
};

/**
 * `/analytics` is retired. Insights supersedes it (phase 15): one screen with
 * filters in place of the four-tab page, which is the acceptance criterion the
 * old page was the counter-example to.
 *
 * It redirects rather than being deleted. `/analytics` has existed since phase
 * 8, it is linked from the sidebar and from the Home overview, and members
 * have bookmarked it — and the roadmap asks for aliases through the
 * transition, not a dead link.
 *
 * The `/api/analytics/*` endpoints stay as they are for the same reason. They
 * read through the same repositories the insights endpoints do, so neither can
 * drift from the other while both exist.
 */
export default function AnalyticsPage() {
  redirect("/insights");
}
