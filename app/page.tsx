import { redirect } from "next/navigation";

/** The app has no marketing surface. Everything starts at the dashboard. */
export default function RootPage() {
  redirect("/home");
}
