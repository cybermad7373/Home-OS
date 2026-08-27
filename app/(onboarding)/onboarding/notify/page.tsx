import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EnableNotificationsPrompt } from "@/components/notifications/enable-prompt";
import { getMembership, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Notifications" };

/**
 * S-07 — the last step of onboarding.
 *
 * It comes after availability, because the reminders being asked about are
 * timed against the week that was just entered, and a promise the app can
 * already keep is easier to accept than one it cannot.
 */
export default async function OnboardingNotifyPage() {
  const session = await requireSession();
  const membership = await getMembership(session);

  if (!membership) redirect("/onboarding/house");
  if (membership.member.status === "requested") redirect("/onboarding/pending");

  return (
    <EnableNotificationsPrompt
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
    />
  );
}
