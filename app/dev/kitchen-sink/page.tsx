import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KitchenSink } from "./KitchenSink";

export const metadata: Metadata = { title: "Kitchen sink" };

/**
 * Every primitive, every state, both themes, on one page.
 *
 * It exists because rebuilding sixteen primitives can quietly break a screen
 * nobody re-opens for a fortnight. With this, a token change is checked once
 * rather than discovered eleven times.
 *
 * Development only. There is nothing secret on it, but a route that renders
 * every component in the design system is not something to serve to a
 * household — it would be the largest page in the app and it answers no
 * question a member has.
 */
export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitchenSink />;
}
