import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { JoinOrCreate } from "@/components/forms/join-or-create";
import { getMembership, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Join or create a house" };

export default async function OnboardingHousePage() {
  const session = await requireSession();

  // A Google sign-in arrives with no username. Everything else in the house
  // identifies people by one, so it is claimed before a house is chosen.
  const { data: profile } = await session.supabase
    .from("users")
    .select("username")
    .eq("id", session.userId)
    .maybeSingle();
  if (!profile?.username) redirect("/onboarding/username");

  const membership = await getMembership(session);

  if (membership?.member.status === "active") redirect("/dashboard");
  if (membership?.member.status === "pending") redirect("/onboarding/pending");

  return <JoinOrCreate />;
}
