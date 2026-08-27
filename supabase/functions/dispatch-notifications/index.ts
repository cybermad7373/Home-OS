// Edge function: dispatch-notifications
//
// The sender. Everything else in the notification system writes rows; this is
// the only piece that speaks to a push service.
//
// Runs every fifteen minutes (migration 042). The spec says hourly, and hourly
// does not work: N-02 is due thirty minutes before a chore window opens, and a
// sixty-minute poll can deliver it after the window it was warning about. See
// DECISIONS.md D-27.
//
// Idempotent by construction, as section 3.3 requires: it selects only rows
// with `sent_at is null` and stamps `sent_at` as it goes, so a run that dies
// halfway leaves the remainder for the next one and re-sends nothing.
//
// The volume and quiet-hour rules below mirror lib/domain/notifications/. They
// are a deliberate second copy rather than a shared import, for the reason in
// DECISIONS.md D-06 — Deno and Next.js do not share a module graph here — and
// tests/unit/notifications-dispatch.test.ts holds both copies to the same
// worked examples.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPush, vapidFromEnv, type PushSubscription } from "../_shared/webpush.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MAX_PUSH_PER_DAY = 6;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const BATCH_LIMIT = 500;

const PREF_COLUMN: Record<string, string> = {
  chore_reminders: "chore_reminders",
  confirmation_requests: "confirmation_requests",
  chore_outcomes: "chore_outcomes",
  house_activity: "house_activity",
  expense_activity: "expense_activity",
  weekly_digest: "weekly_digest",
  settlement_updates: "settlement_updates",
  decisions: "decisions",
  decision_outcomes: "decision_outcomes",
  membership: "membership",
};

// The two categories a member cannot switch off, and the same reason twice:
// somebody who has muted the app cannot then say they were never told they
// owed money, or that nobody asked them about a decision.
const MANDATORY_CATEGORIES = new Set(["settlement_updates", "decisions"]);

interface CatalogueRow {
  type: string;
  category: string;
  priority: number;
  quiet_hours_exempt: boolean;
}

interface NotificationRow {
  id: string;
  house_id: string;
  member_id: string;
  type: string;
  title: string;
  body: string;
  deep_link: string | null;
  tag: string | null;
  priority: number;
  payload: Record<string, unknown>;
  scheduled_for: string;
}

interface PrefRow {
  member_id: string;
  chore_reminders: boolean;
  confirmation_requests: boolean;
  chore_outcomes: boolean;
  house_activity: boolean;
  expense_activity: boolean;
  weekly_digest: boolean;
  settlement_updates: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

// ---------------------------------------------------------------------------
// Quiet hours. The member's clock, not the server's: the house carries a
// timezone and every member of one house shares it.
// ---------------------------------------------------------------------------

function clockToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesInZone(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function inQuietHours(minuteOfDay: number, startMin: number | null, endMin: number | null): boolean {
  if (startMin === null || endMin === null) return false;
  if (startMin === endMin) return false;
  return startMin < endMin
    ? minuteOfDay >= startMin && minuteOfDay < endMin
    : minuteOfDay >= startMin || minuteOfDay < endMin;
}

// ---------------------------------------------------------------------------
// Priority and volume (section 5)
// ---------------------------------------------------------------------------

function effectivePriority(row: NotificationRow, nowMs: number): number {
  if (row.priority !== 5) return row.priority;
  if (row.type !== "N-02" && row.type !== "N-03") return row.priority;

  const windowStart = row.payload?.window_start;
  if (typeof windowStart !== "string") return row.priority;

  const startsIn = Date.parse(windowStart) - nowMs;
  return startsIn <= 60 * 60 * 1000 ? 3 : 5;
}

/** The same tag inside ten minutes replaces rather than adds. */
function collapseByTag(rows: NotificationRow[]): { kept: NotificationRow[]; dropped: NotificationRow[] } {
  const kept: NotificationRow[] = [];
  const dropped: NotificationRow[] = [];

  for (const row of [...rows].sort(
    (a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for),
  )) {
    const clash = kept.findIndex(
      (existing) =>
        existing.tag !== null &&
        existing.tag === row.tag &&
        Math.abs(Date.parse(existing.scheduled_for) - Date.parse(row.scheduled_for)) <
          DUPLICATE_WINDOW_MS,
    );
    if (clash === -1) {
      kept.push(row);
    } else {
      dropped.push(kept[clash]);
      kept[clash] = row;
    }
  }

  return { kept, dropped };
}

// ---------------------------------------------------------------------------
// The push payload of section 4
// ---------------------------------------------------------------------------

function pushPayload(row: NotificationRow): string {
  const actions: Array<{ action: string; title: string }> = [];

  if (row.type === "N-02" || row.type === "N-03") {
    actions.push({ action: "done", title: "Mark done" });
    actions.push({ action: "later", title: "Snooze 1h" });
  } else if (row.type === "N-06") {
    actions.push({ action: "confirm", title: "Confirm" });
  }

  return JSON.stringify({
    title: row.title,
    body: row.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: row.tag ?? row.id,
    data: {
      url: row.deep_link ?? "/notifications",
      type: row.type,
      notificationId: row.id,
      ...row.payload,
    },
    actions,
    requireInteraction: false,
  });
}

async function markSent(ids: string[], channel: "push" | "in_app", pushed: boolean) {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  await supabase
    .from("notifications")
    .update({ sent_at: now, channel, ...(pushed ? { push_sent_at: now } : {}) })
    .in("id", ids);
}

Deno.serve(async () => {
  const startedAt = Date.now();
  const vapid = vapidFromEnv();

  const { data: catalogue } = await supabase
    .from("notification_types")
    .select("type, category, priority, quiet_hours_exempt");

  const byType = new Map<string, CatalogueRow>(
    (catalogue ?? []).map((row: CatalogueRow) => [row.type, row]),
  );

  const { data: due, error } = await supabase
    .from("notifications")
    .select("id, house_id, member_id, type, title, body, deep_link, tag, priority, payload, scheduled_for")
    .is("sent_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return Response.json({ due: 0, pushed: 0, coalesced: 0 });
  }

  const memberIds = [...new Set(due.map((row: NotificationRow) => row.member_id))];
  const houseIds = [...new Set(due.map((row: NotificationRow) => row.house_id))];

  const [{ data: prefs }, { data: houses }, { data: subscriptions }] = await Promise.all([
    supabase.from("notification_prefs").select("*").in("member_id", memberIds),
    supabase.from("houses").select("id, timezone").in("id", houseIds),
    supabase
      .from("push_subscriptions")
      .select("id, member_id, endpoint, p256dh, auth")
      .in("member_id", memberIds),
  ]);

  const prefsByMember = new Map<string, PrefRow>(
    (prefs ?? []).map((row: PrefRow) => [row.member_id, row]),
  );
  const zoneByHouse = new Map<string, string>(
    (houses ?? []).map((row: { id: string; timezone: string }) => [row.id, row.timezone]),
  );
  const subsByMember = new Map<string, Array<PushSubscription & { id: string }>>();
  for (const row of subscriptions ?? []) {
    const list = subsByMember.get(row.member_id) ?? [];
    list.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    subsByMember.set(row.member_id, list);
  }
  // How much of today's allowance each member has already spent.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: sentToday } = await supabase
    .from("notifications")
    .select("member_id")
    .in("member_id", memberIds)
    .not("push_sent_at", "is", null)
    .gte("push_sent_at", dayStart.toISOString());

  const spentByMember = new Map<string, number>();
  for (const row of sentToday ?? []) {
    spentByMember.set(row.member_id, (spentByMember.get(row.member_id) ?? 0) + 1);
  }

  const byMember = new Map<string, NotificationRow[]>();
  for (const row of due as NotificationRow[]) {
    const list = byMember.get(row.member_id) ?? [];
    list.push(row);
    byMember.set(row.member_id, list);
  }

  const now = new Date();
  const nowMs = now.getTime();
  const deadSubscriptions: string[] = [];
  let pushed = 0;
  let coalesced = 0;
  let suppressed = 0;

  for (const [memberId, rows] of byMember) {
    const memberPrefs = prefsByMember.get(memberId);
    const timezone = zoneByHouse.get(rows[0].house_id) ?? "Asia/Kolkata";
    const localMinute = minutesInZone(now, timezone);
    const quietStart = clockToMinutes(memberPrefs?.quiet_hours_start ?? null);
    const quietEnd = clockToMinutes(memberPrefs?.quiet_hours_end ?? null);
    const quiet = inQuietHours(localMinute, quietStart, quietEnd);

    const { kept, dropped } = collapseByTag(rows);

    // A row a newer one replaced is stamped sent so it never fires later; the
    // feed keeps it, because the feed is the record.
    if (dropped.length > 0) {
      await markSent(dropped.map((row) => row.id), "in_app", false);
    }

    const eligible: NotificationRow[] = [];
    const feedOnly: NotificationRow[] = [];

    for (const row of kept) {
      const entry = byType.get(row.type);
      const category = entry?.category ?? "house_activity";
      const exempt = entry?.quiet_hours_exempt ?? false;

      // Quiet hours: leave the row untouched so the next run after the quiet
      // window ends picks it up. That is what "suppressed notifications queue
      // and deliver at the end of quiet hours" means in practice.
      if (quiet && !exempt) {
        suppressed += 1;
        continue;
      }

      const column = PREF_COLUMN[category];
      const allowed =
        MANDATORY_CATEGORIES.has(category) ||
        !memberPrefs ||
        (memberPrefs as unknown as Record<string, boolean>)[column] !== false;

      if (allowed) eligible.push(row);
      else feedOnly.push(row);
    }

    // A disabled category produces no push and still produces a feed row.
    if (feedOnly.length > 0) {
      await markSent(feedOnly.map((row) => row.id), "in_app", false);
    }

    if (eligible.length === 0) continue;

    eligible.sort((a, b) => {
      const byPriority = effectivePriority(a, nowMs) - effectivePriority(b, nowMs);
      if (byPriority !== 0) return byPriority;
      return Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for);
    });

    const remaining = Math.max(0, MAX_PUSH_PER_DAY - (spentByMember.get(memberId) ?? 0));
    let individual = eligible;
    let folded: NotificationRow[] = [];

    if (eligible.length > remaining) {
      // The digest counts against the cap itself, so an overflow sends one
      // fewer individually rather than one more in total. And a member whose
      // allowance is already spent gets nothing further — not even a digest
      // saying so, because the seventh push is the seventh push whatever it
      // contains. Their feed rows are still written below.
      individual = eligible.slice(0, Math.max(0, remaining - 1));
      folded = eligible.slice(Math.max(0, remaining - 1));

      if (remaining === 0) {
        await markSent(folded.map((row) => row.id), "in_app", false);
        coalesced += folded.length;
        continue;
      }
    }

    // Every device the member has registered: the browser on their laptop and
    // the app on their phone are two rows here and one notification.
    const subs = subsByMember.get(memberId) ?? [];

    for (const row of individual) {
      let delivered = false;

      if (vapid) {
        for (const subscription of subs) {
          const result = await sendPush(subscription, pushPayload(row), vapid);
          if (result.ok) delivered = true;
          // 410 deletes the subscription and does not abort the batch.
          if (result.gone) deadSubscriptions.push(subscription.id);
        }
      }

      if (delivered) pushed += 1;
      await markSent([row.id], delivered ? "push" : "in_app", delivered);
      if (delivered) spentByMember.set(memberId, (spentByMember.get(memberId) ?? 0) + 1);
    }

    if (folded.length > 0) {
      const count = folded.length;
      const digestTitle = `${count} ${count === 1 ? "thing needs" : "things need"} you`;
      const digestBody = folded.slice(0, 3).map((row) => row.title).join(" · ");

      const { data: digestRow } = await supabase
        .from("notifications")
        .insert({
          house_id: folded[0].house_id,
          member_id: memberId,
          type: "N-29",
          title: digestTitle,
          body: digestBody,
          deep_link: "/notifications",
          tag: "coalesced-digest",
          priority: 5,
          payload: { folded: folded.map((row) => row.id) },
          scheduled_for: now.toISOString(),
        })
        .select("id")
        .single();

      let delivered = false;
      if (vapid && digestRow) {
        for (const subscription of subs) {
          const result = await sendPush(
            subscription,
            pushPayload({
              ...folded[0],
              id: digestRow.id,
              type: "N-29",
              title: digestTitle,
              body: digestBody,
              deep_link: "/notifications",
              tag: "coalesced-digest",
              payload: {},
            }),
            vapid,
          );
          if (result.ok) delivered = true;
          if (result.gone) deadSubscriptions.push(subscription.id);
        }
      }

      if (digestRow) {
        await markSent([digestRow.id], delivered ? "push" : "in_app", delivered);
        await supabase
          .from("notifications")
          .update({
            sent_at: now.toISOString(),
            channel: "in_app",
            coalesced_into: digestRow.id,
          })
          .in("id", folded.map((row) => row.id));
      }

      coalesced += folded.length;
    }
  }

  if (deadSubscriptions.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", [...new Set(deadSubscriptions)]);
  }

  return Response.json({
    due: due.length,
    pushed,
    coalesced,
    suppressed,
    removed_subscriptions: [...new Set(deadSubscriptions)].length,
    ms: Date.now() - startedAt,
  });
});
