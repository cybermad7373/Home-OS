import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationPrefsForm } from "@/components/notifications/prefs-form";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getPrefs, listDevices } from "@/lib/data/notifications";

export const metadata: Metadata = { title: "Notifications" };

/**
 * S — notification settings, NT-05.
 *
 * The screen exists so that the alternative to being annoyed is turning
 * something off rather than uninstalling the app. Every switch here is a
 * concession made in advance to that trade.
 */
export default async function NotificationSettingsPage() {
  const session = await requireSession();
  await requireActiveMembership(session);

  const [prefs, devices] = await Promise.all([getPrefs(session), listDevices(session)]);

  // Preferences are created by trigger the moment a membership is, so this is
  // an impossible state rather than an empty one. Saying so beats rendering a
  // form bound to nothing.
  if (!prefs) {
    return (
      <>
        <PageHeader title="Notifications" />
        <p className="text-text-muted">
          Your preferences have not been created yet. Reload in a moment.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="What reaches you, when, and on which devices"
      />

      <NotificationPrefsForm
        initial={prefs}
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        devices={devices}
      />
    </>
  );
}
