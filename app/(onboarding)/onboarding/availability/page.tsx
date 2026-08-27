import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AvailabilityForm } from "@/components/house/availability-form";
import { getAvailability } from "@/lib/data/availability";
import { getMembership, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Your week" };

/**
 * S-07 — the availability step of onboarding.
 *
 * It comes after the profile step and before the dashboard, so that the first
 * schedule a new member appears in already fits their week. Skipping it is
 * allowed and safe: BR-020 treats a missing pattern as home all day, which
 * gives them more work rather than less.
 */
export default async function OnboardingAvailabilityPage() {
  const session = await requireSession();
  const membership = await getMembership(session);

  if (!membership) redirect("/onboarding/house");
  if (membership.member.status === "pending") redirect("/onboarding/pending");

  const days = await getAvailability(
    session,
    membership.house.id,
    membership.member.id,
  );

  return <AvailabilityForm initialDays={days} isOnboarding />;
}
