import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/forms/profile-form";
import { getHouseContext, getMembership, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Your profile" };

export default async function OnboardingProfilePage() {
  const session = await requireSession();
  const membership = await getMembership(session);

  if (!membership) redirect("/onboarding/house");
  if (membership.member.status === "pending") redirect("/onboarding/pending");

  const context = await getHouseContext(session);
  const { data: profile } = await session.supabase
    .from("users")
    .select("upi_vpa")
    .eq("id", session.userId)
    .maybeSingle();

  return (
    <ProfileForm
      initialCanCook={context.me.canCook}
      initialUpi={profile?.upi_vpa ?? ""}
      roomName={context.me.room?.name ?? null}
      isOnboarding
    />
  );
}
