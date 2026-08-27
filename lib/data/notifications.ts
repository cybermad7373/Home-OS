import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import type { NotificationType, PrefCategory } from "@/lib/domain/notifications/catalogue";
import { deviceLabel, type DevicePlatform } from "@/lib/utils/device";
import type { Session } from "./house";

/**
 * The notification repository.
 *
 * There is no `create` here on purpose. Notifications are produced by database
 * triggers and scheduled jobs, never by a route handler, so the only writes
 * this file performs are the ones a member makes about their own feed: reading
 * it, muting a category, registering a device.
 */

export interface FeedItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  sentAt: string | null;
}

export interface NotificationPrefs {
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

export interface FeedPage {
  items: FeedItem[];
  unreadCount: number;
  /** The `created_at` to pass back as `before` for the next page, or null. */
  nextCursor: string | null;
}

interface FeedOptions {
  limit?: number;
  before?: string;
  unreadOnly?: boolean;
}

/**
 * The feed, newest first. RLS restricts it to the caller's own rows, so no
 * member filter is applied here — adding one would be a second lock on the same
 * door and would hide a broken policy rather than expose it.
 */
export async function getFeed(session: Session, options: FeedOptions = {}): Promise<FeedPage> {
  const limit = options.limit ?? 50;

  let query = session.supabase
    .from("notifications")
    .select("id, type, title, body, deep_link, payload, created_at, read_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (options.before) query = query.lt("created_at", options.before);
  if (options.unreadOnly) query = query.is("read_at", null);

  const [{ data, error }, unreadCount] = await Promise.all([
    query,
    getUnreadCount(session),
  ]);

  if (error) throw apiErrorFromPostgres(error);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      deepLink: row.deep_link,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: row.created_at,
      readAt: row.read_at,
      sentAt: row.sent_at,
    })),
    unreadCount,
    nextCursor: hasMore ? page[page.length - 1].created_at : null,
  };
}

/** The tab-bar badge. Counts every unread row, however it was delivered. */
export async function getUnreadCount(session: Session): Promise<number> {
  const { count, error } = await session.supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) throw apiErrorFromPostgres(error);
  return count ?? 0;
}

export async function markRead(session: Session, id: string): Promise<void> {
  const { error } = await session.supabase.rpc("mark_notification_read", {
    p_notification_id: id,
  });
  if (error) throw apiErrorFromPostgres(error);
}

export async function markAllRead(session: Session, houseId: string): Promise<number> {
  const { data, error } = await session.supabase.rpc("mark_all_notifications_read", {
    p_house_id: houseId,
  });
  if (error) throw apiErrorFromPostgres(error);
  return data ?? 0;
}

export async function getPrefs(session: Session): Promise<NotificationPrefs | null> {
  const { data, error } = await session.supabase
    .from("notification_prefs")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) return null;

  return {
    choreReminders: data.chore_reminders,
    confirmationRequests: data.confirmation_requests,
    choreOutcomes: data.chore_outcomes,
    houseActivity: data.house_activity,
    expenseActivity: data.expense_activity,
    weeklyDigest: data.weekly_digest,
    settlementUpdates: data.settlement_updates,
    decisions: data.decisions,
    decisionOutcomes: data.decision_outcomes,
    membership: data.membership,
    quietHoursStart: data.quiet_hours_start,
    quietHoursEnd: data.quiet_hours_end,
  };
}

export interface PrefsUpdate {
  chore_reminders?: boolean;
  confirmation_requests?: boolean;
  chore_outcomes?: boolean;
  house_activity?: boolean;
  expense_activity?: boolean;
  weekly_digest?: boolean;
  decision_outcomes?: boolean;
  membership?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  quiet_hours_off?: boolean;
}

export async function setPrefs(
  session: Session,
  update: PrefsUpdate,
): Promise<NotificationPrefs | null> {
  const { error } = await session.supabase.rpc("set_notification_prefs", {
    p_chore_reminders: update.chore_reminders ?? undefined,
    p_confirmation_requests: update.confirmation_requests ?? undefined,
    p_chore_outcomes: update.chore_outcomes ?? undefined,
    p_house_activity: update.house_activity ?? undefined,
    p_expense_activity: update.expense_activity ?? undefined,
    p_weekly_digest: update.weekly_digest ?? undefined,
    p_decision_outcomes: update.decision_outcomes ?? undefined,
    p_membership: update.membership ?? undefined,
    p_quiet_hours_start: update.quiet_hours_start ?? undefined,
    p_quiet_hours_end: update.quiet_hours_end ?? undefined,
    p_quiet_hours_off: update.quiet_hours_off ?? false,
  });

  if (error) throw apiErrorFromPostgres(error);
  return getPrefs(session);
}

export async function savePushSubscription(
  session: Session,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    platform?: DevicePlatform;
  },
  userAgent: string | null,
): Promise<void> {
  const { error } = await session.supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
    p_user_agent: userAgent ?? undefined,
    p_platform: subscription.platform ?? "web",
  });
  if (error) throw apiErrorFromPostgres(error);
}

export async function deletePushSubscription(
  session: Session,
  endpoint: string,
): Promise<void> {
  const { error } = await session.supabase.rpc("delete_push_subscription", {
    p_endpoint: endpoint,
  });
  if (error) throw apiErrorFromPostgres(error);
}

export type { DevicePlatform };

export interface Device {
  id: string;
  endpoint: string;
  platform: DevicePlatform;
  label: string;
  lastSeenAt: string;
  createdAt: string;
}

/**
 * Every device registered to the caller, newest use first.
 *
 * Push is the only channel that leaves the app, so this list is the whole
 * answer to "where does the house reach me": a member who is being interrupted
 * on a laptop they no longer use can see that laptop and remove it, rather than
 * turning a category off for every device they own.
 *
 * RLS restricts the rows to the caller's own, so there is no member filter
 * here — a second lock on the same door would hide a broken policy.
 */
export async function listDevices(session: Session): Promise<Device[]> {
  const { data, error } = await session.supabase
    .from("push_subscriptions")
    .select("id, endpoint, platform, user_agent, last_seen_at, created_at")
    .order("last_seen_at", { ascending: false });

  if (error) throw apiErrorFromPostgres(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    endpoint: row.endpoint,
    platform: (row.platform ?? "web") as DevicePlatform,
    label: deviceLabel(row.user_agent, (row.platform ?? "web") as DevicePlatform),
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  }));
}

/** The preference switches, in the order the settings screen shows them. */
export const PREF_ROWS: ReadonlyArray<{
  key: Exclude<PrefCategory, "settlement_updates" | "decisions">;
  field: keyof NotificationPrefs;
  label: string;
  help: string;
}> = [
  {
    key: "chore_reminders",
    field: "choreReminders",
    label: "Chore reminders",
    help: "Before a window opens, and before a deadline",
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
    help: "Confirmed, rejected, missed — what happened to your own work",
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
    help: "How a decision you were part of ended",
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
    help: "One summary on Sunday evening",
  },
];
