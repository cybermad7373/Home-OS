import type { Metadata } from "next";
import { redirect } from "next/navigation";

/*
  A redirect still gets a title and a description. It costs nothing, and a
  page in this tree without them is indistinguishable from one that was
  forgotten — which is how three of them ended up with neither.
*/
export const metadata: Metadata = {
  title: "Home",
  description:
    "Where the home stands: the week's effort, the month's money, and what is waiting on you.",
};

/**
 * S-08 retired. The Home overview is S-51 at `/home`.
 *
 * The route stays as a redirect rather than being deleted: it was the app's
 * `start_url`, it is bookmarked, it is what an installed PWA opens, and it is
 * the `next` an old sign-in link still carries. A 404 there would look like the
 * app had lost the person's Home.
 */
export default function DashboardPage() {
  redirect("/home");
}
