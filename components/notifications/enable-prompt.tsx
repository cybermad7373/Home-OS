"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { enablePush, pushSupported, type PushState } from "@/lib/utils/push";

/**
 * S-07 — the permission ask, docs/08-UI-UX-SPEC.md section 4.1.
 *
 * The four bullets come before the button, and that ordering is the whole
 * point of the screen: asking for notification permission with no explanation
 * is the fastest route to a permanent denial, and a permanent denial cannot be
 * undone from inside the app. "Skip for now" is present and does not nag.
 */

const PROMISES = [
  "A reminder before a chore is due — timed to when you are actually home",
  "A nudge when somebody needs you to confirm what they did",
  "Anything about money: an approval, a rejection, what you owe at month end",
  "One summary on Sunday. Six notifications a day is the hard ceiling",
];

export function EnableNotificationsPrompt({
  vapidPublicKey,
  nextHref = "/home",
}: {
  vapidPublicKey: string | null;
  nextHref?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<PushState>("default");
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!vapidPublicKey) {
      router.push(nextHref);
      return;
    }

    setBusy(true);
    const result = await enablePush(vapidPublicKey);
    setBusy(false);
    setState(result);

    if (result === "subscribed") {
      // Straight on. Dwelling on a granted permission is a screen nobody needs
      // to read twice.
      router.push(nextHref);
    }
  }

  const unavailable = !vapidPublicKey || (typeof window !== "undefined" && !pushSupported());

  return (
    <div>
      <h1 className="title-text mb-1">Let the house reach you</h1>
      <p className="mb-5 text-text-muted">
        The app is only useful if it can tell you something before you have
        opened it. Here is exactly what it will send.
      </p>

      <Card className="mb-4">
        <ul className="flex flex-col gap-3">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex items-start gap-2.5">
              <Check size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              <span className="text-[15px] leading-6">{promise}</span>
            </li>
          ))}
        </ul>
      </Card>

      {state === "denied" ? (
        <Alert tone="warning" className="mb-4">
          Your browser has blocked notifications for this site. You can turn them
          back on in its site settings — the app cannot ask again.
        </Alert>
      ) : null}

      {unavailable ? (
        <Alert tone="info" className="mb-4">
          This browser cannot receive push. Everything still arrives in your feed
          inside the app.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button block loading={busy} onClick={ask} disabled={unavailable}>
          <Bell size={18} aria-hidden /> Turn on notifications
        </Button>
        <Button block variant="ghost" onClick={() => router.push(nextHref)}>
          Skip for now
        </Button>
      </div>

      <p className="caption-text mt-4 text-center text-text-subtle">
        You can change any of this later under More → Notifications.
      </p>
    </div>
  );
}
