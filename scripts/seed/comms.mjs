/**
 * Notifications and the devices they reach.
 *
 * Most of the feed writes itself: the expense, chore, decision, membership and
 * settlement triggers have all fired by the time this runs, so the rows already
 * exist and were produced the way real ones are. What is left is the state
 * around them — what has been read, who has quiet hours, and which devices are
 * registered.
 */
import { admin, must } from "./env.mjs";
import { daysAgo, hoursAgo } from "./util.mjs";

const PREFS = [
  // A lead who wants everything.
  { chore_reminders: true, house_activity: true, expense_activity: true, weekly_digest: true, quiet_hours_start: "23:30", quiet_hours_end: "06:30" },
  // Somebody who has turned the noisy ones off but kept what needs an answer.
  { chore_reminders: true, house_activity: false, expense_activity: false, weekly_digest: true, quiet_hours_start: "22:00", quiet_hours_end: "07:30" },
  // A night-shift worker: no quiet hours at all, because theirs are inverted.
  { chore_reminders: true, house_activity: true, expense_activity: true, weekly_digest: false, quiet_hours_start: null, quiet_hours_end: null },
  // Somebody who only wants the things that block other people.
  { chore_reminders: false, house_activity: false, expense_activity: false, weekly_digest: false, decisions: true, confirmation_requests: true, quiet_hours_start: "23:00", quiet_hours_end: "07:00" },
];

export async function seedComms(context) {
  const { houseId, memberIds } = context;

  // The prefs row itself is written by a trigger when the member is created;
  // this is the house telling them apart.
  for (const [index, memberId] of memberIds.entries()) {
    await admin
      .from("notification_prefs")
      .update(PREFS[index % PREFS.length])
      .eq("house_id", houseId)
      .eq("member_id", memberId);
  }

  // Devices. One phone each for the first two, plus a laptop, plus one that
  // has been failing since last week — the state the cleanup job looks for.
  const devices = [
    {
      member_id: memberIds[0],
      endpoint: `https://fcm.googleapis.com/fcm/send/demo-${houseId.slice(0, 8)}-pixel`,
      user_agent: "Mozilla/5.0 (Linux; Android 15; Pixel 8)",
      platform: "web",
      last_seen_at: hoursAgo(3),
    },
    {
      member_id: memberIds[0],
      endpoint: `https://updates.push.services.mozilla.com/wpush/v2/demo-${houseId.slice(0, 8)}-laptop`,
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/141.0",
      platform: "web",
      last_seen_at: daysAgo(2),
    },
    {
      member_id: memberIds[1 % memberIds.length],
      endpoint: `https://fcm.googleapis.com/fcm/send/demo-${houseId.slice(0, 8)}-oneplus`,
      user_agent: "Mozilla/5.0 (Linux; Android 14; OnePlus 12)",
      platform: "web",
      last_seen_at: hoursAgo(30),
    },
    {
      member_id: memberIds[2 % memberIds.length],
      endpoint: `https://fcm.googleapis.com/fcm/send/demo-${houseId.slice(0, 8)}-stale`,
      user_agent: "Mozilla/5.0 (Linux; Android 13; Redmi Note 12)",
      platform: "web",
      failed_at: daysAgo(6),
      last_seen_at: daysAgo(20),
    },
  ];

  must(
    "insert push_subscriptions",
    await admin
      .from("push_subscriptions")
      .insert(
        devices.map((device) => ({
          house_id: houseId,
          p256dh: "BJ3hDemoPublicKeyForSeedDataOnlyNotAValidCurvePointxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          auth: "seedAuthSecret0000000000",
          ...device,
        })),
      )
      .select("id"),
  );

  // A feed where everything is unread reads as broken. The older half is
  // marked read, and the count in the bar is what is genuinely left.
  const feed = must(
    "select notifications",
    await admin
      .from("notifications")
      .select("id, created_at")
      .eq("house_id", houseId)
      .order("created_at", { ascending: true }),
  );

  const readUpTo = Math.floor(feed.length * 0.6);
  const readIds = feed.slice(0, readUpTo).map((row) => row.id);
  for (let index = 0; index < readIds.length; index += 200) {
    await admin
      .from("notifications")
      .update({ read_at: hoursAgo(12), sent_at: hoursAgo(13) })
      .in("id", readIds.slice(index, index + 200));
  }

  // The unread ones have still been delivered — an unsent notification is a
  // different state, and the digest job is the only thing that leaves one.
  const unreadIds = feed.slice(readUpTo).map((row) => row.id);
  for (let index = 0; index < unreadIds.length; index += 200) {
    await admin
      .from("notifications")
      .update({ sent_at: hoursAgo(2), push_sent_at: hoursAgo(2) })
      .in("id", unreadIds.slice(index, index + 200));
  }
}
