"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Laptop, Smartphone, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchRow } from "@/components/ui/switch";
import { Columns } from "@/components/layout/columns";
import { List, Section } from "@/components/layout/section";
import { useToast } from "@/components/ui/toast";
import type { Device } from "@/lib/data/notifications";
import { lastSeenLabel } from "@/lib/utils/device";
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupported,
  type PushState,
} from "@/lib/utils/push";

/**
 * Notification preferences — docs/11-NOTIFICATIONS-SPEC.md section 6, NT-05.
 *
 * Three things live here and they are genuinely different: what the house may
 * interrupt you about, when it may not interrupt you at all, and which devices
 * it reaches. Settlement is shown with a padlock rather than hidden, because a
 * member is entitled to know that one category cannot be muted — and to know it
 * before they owe somebody money rather than after.
 */

export interface PrefsView {
  choreReminders: boolean;
  confirmationRequests: boolean;
  choreOutcomes: boolean;
  houseActivity: boolean;
  expenseActivity: boolean;
  weeklyDigest: boolean;
  settlementUpdates: boolean;
  decisions: boolean;
  decisionOutcomes: boolean;
  membership: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

type ToggleKey =
  | "chore_reminders"
  | "confirmation_requests"
  | "chore_outcomes"
  | "house_activity"
  | "expense_activity"
  | "decision_outcomes"
  | "membership"
  | "weekly_digest";

const ROWS: ReadonlyArray<{ key: ToggleKey; field: keyof PrefsView; label: string; help: string }> = [
  {
    key: "chore_reminders",
    field: "choreReminders",
    label: "Chore reminders",
    help: "Before a window opens, and again before the deadline",
  },
  {
    key: "confirmation_requests",
    field: "confirmationRequests",
    label: "Confirmation requests",
    help: "When somebody says they did something and needs a witness",
  },
  {
    key: "chore_outcomes",
    field: "choreOutcomes",
    label: "My chores",
    help: "Confirmed, rejected or missed — what happened to your own work",
  },
  {
    key: "house_activity",
    field: "houseActivity",
    label: "House activity",
    help: "Misses, the chore pool, new members and guests",
  },
  {
    key: "expense_activity",
    field: "expenseActivity",
    label: "Money",
    help: "Approvals, rejections and budget warnings",
  },
  {
    key: "decision_outcomes",
    field: "decisionOutcomes",
    label: "Decision outcomes",
    help: "How a decision ended, once the house has answered it",
  },
  {
    key: "membership",
    field: "membership",
    label: "Joining and leaving",
    help: "Requests to join, and changes to who is a lead",
  },
  {
    key: "weekly_digest",
    field: "weeklyDigest",
    label: "Weekly digest",
    help: "One summary, Sunday evening",
  },
];

/** "23:00:00" from Postgres, "23:00" in an `<input type="time">`. */
function toClock(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

export function NotificationPrefsForm({
  initial,
  vapidPublicKey,
  devices,
}: {
  initial: PrefsView;
  vapidPublicKey: string | null;
  devices: Device[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState>("default");
  const [quietStart, setQuietStart] = useState(toClock(initial.quietHoursStart));
  const [quietEnd, setQuietEnd] = useState(toClock(initial.quietHoursEnd));
  // Which of the listed devices is the one being looked at. Only the browser
  // can answer that, so the server sends the list and this fills in the "this
  // one" marker afterwards.
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);

  // Resolved once, asynchronously: whether this device can receive push is a
  // question about the browser and the service worker, not about React state,
  // and it cannot be answered during a server render at all.
  useEffect(() => {
    let cancelled = false;

    async function resolve(): Promise<PushState> {
      if (!pushSupported()) return "unsupported";
      if (!vapidPublicKey) return "unconfigured";

      try {
        const registration = await navigator.serviceWorker.ready;
        if (await registration.pushManager.getSubscription()) return "subscribed";
      } catch {
        // No service worker yet — the permission alone is the honest answer.
      }

      return Notification.permission as PushState;
    }

    void resolve().then((state) => {
      if (!cancelled) setPushState(state);
    });

    void currentSubscription().then((subscription) => {
      if (!cancelled) setThisEndpoint(subscription?.endpoint ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function patch(body: Record<string, unknown>, key: string) {
    setSaving(key);
    const response = await fetch("/api/notifications/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(null);

    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      toast(detail?.error?.message ?? "Could not save that", "danger");
      return false;
    }

    router.refresh();
    return true;
  }

  async function toggle(row: (typeof ROWS)[number]) {
    const next = !prefs[row.field];
    setPrefs((current) => ({ ...current, [row.field]: next }));
    const ok = await patch({ [row.key]: next }, row.key);
    if (!ok) setPrefs((current) => ({ ...current, [row.field]: !next }));
  }

  async function saveQuietHours() {
    if (!quietStart || !quietEnd) {
      toast("Set both ends, or turn quiet hours off", "danger");
      return;
    }
    await patch({ quiet_hours_start: quietStart, quiet_hours_end: quietEnd }, "quiet");
  }

  async function clearQuietHours() {
    setQuietStart("");
    setQuietEnd("");
    await patch({ quiet_hours_off: true }, "quiet");
  }

  async function togglePush() {
    if (!vapidPublicKey) return;

    if (pushState === "subscribed") {
      setSaving("push");
      await disablePush();
      setSaving(null);
      setPushState(Notification.permission as PushState);
      toast("This device will stop getting push");
      return;
    }

    setSaving("push");
    const state = await enablePush(vapidPublicKey);
    setSaving(null);
    setPushState(state);

    if (state === "subscribed") toast("This device is registered", "success");
    else if (state === "denied") {
      toast("Your browser is blocking notifications for this site", "danger");
    }
  }

  async function removeDevice(device: Device) {
    setSaving(device.id);

    // If it is this device, unsubscribe locally too — deleting the row alone
    // would leave the browser holding a subscription nothing sends to, and the
    // next app open would register it again.
    if (device.endpoint === thisEndpoint) {
      await disablePush();
      setPushState(Notification.permission as PushState);
      setThisEndpoint(null);
    } else {
      await fetch("/api/notifications/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: device.endpoint }),
      });
    }

    setSaving(null);
    toast(`${device.label} removed`);
    router.refresh();
  }

  return (
    <Columns
      asideFirst
      main={
        <>
          <Section label="What reaches you" className="mt-0">
            <p className="caption-text mb-3 text-text-muted">
              Everything is written to your feed whatever you choose here. These
              switches decide what interrupts you.
            </p>

            <List>
              {ROWS.map((row) => (
                <SwitchRow
                  key={row.key}
                  label={row.label}
                  help={row.help}
                  checked={prefs[row.field] as boolean}
                  disabled={saving === row.key}
                  onChange={() => void toggle(row)}
                />
              ))}

              <SwitchRow
                locked
                label="Settlement"
                help="A member who has muted the app cannot then say they were never told they owed money."
              />

              {/* Shown with a padlock rather than hidden, per D-30: a rule a
                  member discovers by being surprised is a rule they resent. */}
              <SwitchRow
                locked
                label="Decisions waiting on you"
                help="If these could be silenced, the house could decide something without you and you would have no way of knowing."
              />
            </List>
          </Section>

          <Section label="Quiet hours">
            <p className="caption-text mb-3 text-text-muted">
              Nothing arrives between these times. Anything that comes due waits
              and is delivered when they end. Settlement is the one exception.
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="quiet-start">From</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={quietStart}
                  onChange={(event) => setQuietStart(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="quiet-end">Until</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={quietEnd}
                  onChange={(event) => setQuietEnd(event.target.value)}
                />
              </div>
              <Button size="sm" loading={saving === "quiet"} onClick={saveQuietHours}>
                Save
              </Button>
              {prefs.quietHoursStart ? (
                <Button size="sm" variant="ghost" onClick={clearQuietHours}>
                  Turn off
                </Button>
              ) : null}
            </div>
          </Section>
        </>
      }
      aside={
        <>
          {/* The rail holds the two questions about *this* browser rather than
              about you: whether it may interrupt you at all, and which other
              devices already can. On a phone it comes first, because a member
              who arrives here to turn push on should not have to scroll past
              ten switches that do nothing until they have. */}
          <Section label="This device" className="mt-0">
            <p className="caption-text mb-3 text-text-muted">
              Push reaches you with the app closed. Each device is registered
              separately — your phone and your laptop are two answers to this
              question.
            </p>

            {pushState === "unsupported" ? (
              <Alert tone="info">
                This browser cannot receive push notifications. On Android, install
                the app to the home screen first.
              </Alert>
            ) : pushState === "unconfigured" ? (
              <Alert tone="warning">
                Push is not configured for this deployment yet. Everything still
                arrives in the feed.
              </Alert>
            ) : pushState === "denied" ? (
              <Alert tone="warning">
                Your browser is blocking notifications for this site. Turn them back
                on in the site settings, then reload.
              </Alert>
            ) : (
              <Button
                block
                variant={pushState === "subscribed" ? "secondary" : "primary"}
                loading={saving === "push"}
                onClick={togglePush}
              >
                {pushState === "subscribed" ? (
                  <>
                    <BellRing size={16} aria-hidden /> Registered — turn off
                  </>
                ) : (
                  <>
                    <Bell size={16} aria-hidden /> Enable push on this device
                  </>
                )}
              </Button>
            )}
          </Section>

          <Section label="Your devices">
            {devices.length === 0 ? (
              <p className="caption-text text-text-muted">
                No devices registered yet. Turn push on above and this one appears
                here.
              </p>
            ) : (
              <List>
                {devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {device.platform === "web" ? (
                        <Laptop size={18} aria-hidden className="shrink-0 text-text-muted" />
                      ) : (
                        <Smartphone size={18} aria-hidden className="shrink-0 text-text-muted" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {device.label}
                          {device.endpoint === thisEndpoint ? (
                            <span className="caption-text text-text-muted"> · this device</span>
                          ) : null}
                        </p>
                        <p className="caption-text text-text-muted">
                          Last used {lastSeenLabel(device.lastSeenAt).toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={saving === device.id}
                      onClick={() => void removeDevice(device)}
                    >
                      <Trash2 size={16} aria-hidden />
                      <span className="sr-only">Remove {device.label}</span>
                    </Button>
                  </li>
                ))}
              </List>
            )}
            <p className="caption-text mt-2 text-text-muted">
              Removing one stops notifications there and nowhere else.
            </p>
          </Section>
        </>
      }
    />
  );
}
