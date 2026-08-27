"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

/**
 * S — the in-app feed, docs/11-NOTIFICATIONS-SPEC.md section 8.
 *
 * Grouped by day, newest first, unread tinted. Every row deep-links to the
 * thing it is about, and the rows that carry an action carry its button inline
 * — which is what makes the feed a work queue rather than a log.
 *
 * The feed holds every notification the system produced for this member,
 * including the ones their preferences stopped from being pushed. Muting a
 * category silences the phone; it does not edit the record.
 */

export interface FeedItemView {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/** The types whose row can be resolved without leaving the feed. */
const INLINE_ACTION: Record<string, { label: string; endpoint: (id: string) => string }> = {
  "N-06": {
    label: "Confirm",
    endpoint: (assignmentId) => `/api/chores/${assignmentId}/confirm`,
  },
  "N-02": { label: "Mark done", endpoint: (assignmentId) => `/api/chores/${assignmentId}/done` },
  "N-03": { label: "Mark done", endpoint: (assignmentId) => `/api/chores/${assignmentId}/done` },
};

function dayLabel(iso: string, timezone: string, today: string): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

  if (date === today) return "Today";

  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "Yesterday";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function timeLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function NotificationFeed({
  initial,
  initialCursor,
  timezone,
  today,
}: {
  initial: FeedItemView[];
  initialCursor: string | null;
  timezone: string;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [busy, setBusy] = useState<string | null>(null);

  const unread = items.filter((item) => item.readAt === null).length;

  async function markAllRead() {
    setBusy("all");
    const response = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setBusy(null);

    if (!response.ok) {
      toast("Could not mark them read", "danger");
      return;
    }

    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: now })),
    );
    router.refresh();
  }

  async function markOneRead(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  async function act(item: FeedItemView) {
    const action = INLINE_ACTION[item.type];
    const assignmentId = item.payload.assignment_id;
    if (!action || typeof assignmentId !== "string") return;

    setBusy(item.id);
    const response = await fetch(action.endpoint(assignmentId), { method: "POST" });
    setBusy(null);

    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      toast(detail?.error?.message ?? "That did not go through", "danger");
      return;
    }

    toast(action.label === "Confirm" ? "Confirmed" : "Marked done", "success");
    await markOneRead(item.id);
  }

  async function loadMore() {
    if (!cursor) return;
    setBusy("more");
    const response = await fetch(`/api/notifications?before=${encodeURIComponent(cursor)}`);
    setBusy(null);

    if (!response.ok) {
      toast("Could not load older entries", "danger");
      return;
    }

    const page = await response.json();
    setItems((current) => [...current, ...page.items]);
    setCursor(page.nextCursor);
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BellOff size={28} aria-hidden />}
        title="Nothing yet"
        body="Reminders, confirmations and anything the house needs you for will land here."
      />
    );
  }

  const groups: Array<{ label: string; items: FeedItemView[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, timezone, today);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div>
      {unread > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="caption-text text-text-muted">
            {unread} unread {unread === 1 ? "entry" : "entries"}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={markAllRead}
            loading={busy === "all"}
          >
            <Check size={16} aria-hidden /> Mark all read
          </Button>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.label} className="mb-5">
          <h2 className="caption-text mb-2 font-medium uppercase tracking-wide text-text-muted">
            {group.label}
          </h2>
          <ul className="flex flex-col gap-2">
            {group.items.map((item) => {
              const action = INLINE_ACTION[item.type];
              const canAct = action && typeof item.payload.assignment_id === "string";

              return (
                <li key={item.id}>
                  <Card
                    className={cn(
                      "flex items-start gap-3",
                      item.readAt ? null : "border-primary/40 bg-primary/[0.04]",
                    )}
                  >
                    {item.readAt ? null : (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium">{item.title}</p>
                        <span className="caption-text shrink-0 text-text-subtle">
                          {timeLabel(item.createdAt, timezone)}
                        </span>
                      </div>
                      <p className="caption-text text-text-muted">{item.body}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {item.deepLink ? (
                          <Link
                            href={item.deepLink}
                            onClick={() => void markOneRead(item.id)}
                            className="caption-text font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Open
                          </Link>
                        ) : null}

                        {canAct ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === item.id}
                            onClick={() => void act(item)}
                          >
                            {action.label}
                          </Button>
                        ) : null}

                        {item.readAt ? null : (
                          <button
                            type="button"
                            onClick={() => void markOneRead(item.id)}
                            className="caption-text text-text-muted underline-offset-2 hover:underline"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {cursor ? (
        <Button variant="ghost" block loading={busy === "more"} onClick={loadMore}>
          Older
        </Button>
      ) : null}
    </div>
  );
}
