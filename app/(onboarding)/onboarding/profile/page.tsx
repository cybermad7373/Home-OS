import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/forms/profile-form";
import {
  getHouseContext,
  getMembership,
  getOwnProfile,
  requireSession,
} from "@/lib/data/house";

export const metadata: Metadata = { title: "Your profile" };

export default async function OnboardingProfilePage() {
  const session = await requireSession();
  const membership = await getMembership(session);

  if (!membership) redirect("/onboarding/house");
  if (membership.member.status === "requested") redirect("/onboarding/pending");

  const context = await getHouseContext(session);
  const profile = await getOwnProfile(session);

  return (
    <ProfileForm
      initialCanCook={context.me.canCook}
      initialUpi={profile?.upi_vpa ?? ""}
      roomName={context.me.room?.name ?? null}
      isOnboarding
    />
  );
}
