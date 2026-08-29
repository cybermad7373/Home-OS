import { redirect } from "next/navigation";

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
