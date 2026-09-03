import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * The phase-7 assertions that only the database can settle — section 9 of
 * docs/11-NOTIFICATIONS-SPEC.md:
 *
 *   "Every notification type writes a feed row even when push fails on every
 *    device."
 *   "A disabled category produces no push, but still produces a feed row."
 *   "The same tag within 10 minutes replaces rather than adds."
 *
 * Plus the two the spec does not name and the product depends on: that a member
 * cannot read another member's feed, and that settlement cannot be muted.
 *
 * The timing and volume rules are proved in tests/unit against pure functions.
 * What is proved here is that the triggers fire at all, and that the rows they
 * write are addressed to the right people.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);
const describeIfConfigured = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

describeIfConfigured("notifications", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  let ravi: SupabaseClient;
  let kumar: SupabaseClient;
  let houseId: string;
  let raviMemberId: string;
  let kumarMemberId: string;
  let templateId: string;
  const userIds: string[] = [];

  const weekStart = "2026-08-17";

  async function makeUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
    const email = `${label}-${stamp}@houseos.dev`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    userIds.push(data.user!.id);
    return { id: data.user!.id, client };
  }

  beforeAll(async () => {
    const first = await makeUser("notif-ravi");
    const second = await makeUser("notif-kumar");
    ravi = first.client;
    kumar = second.client;

    const { data: house, error } = await ravi.rpc("create_house", {
      p_name: `Notify House ${stamp}`,
      p_address: null,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (house as { house_id: string }[])[0].house_id;

    await admin.from("house_members").insert({
      house_id: houseId,
      user_id: second.id,
      role: "member",
      status: "active",
      can_cook: true,
    });

    const { data: members } = await admin
      .from("house_members")
      .select("id, user_id")
      .eq("house_id", houseId);

    const rows = members as { id: string; user_id: string }[];
    raviMemberId = rows.find((row) => row.user_id === first.id)!.id;
    kumarMemberId = rows.find((row) => row.user_id === second.id)!.id;

    const { data: template } = await admin
      .from("chore_templates")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();
    templateId = (template as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    if (!configured || !houseId) return;
    await admin.from("notifications").delete().eq("house_id", houseId);
    await admin.from("chore_assignments").delete().eq("house_id", houseId);
    await admin.from("effort_ledger").delete().eq("house_id", houseId);
    await admin.from("expenses").delete().eq("house_id", houseId);
    await admin.from("houses").delete().eq("id", houseId);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  }, 120_000);

  async function feedOf(memberId: string, type?: string) {
    let query = admin
      .from("notifications")
      .select("id, type, title, body, tag, member_id, read_at, payload")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

    if (type) query = query.eq("type", type);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async function makeAssignment(assignee: string, points = 30) {
    const { data, error } = await admin
      .from("chore_assignments")
      .insert({
        house_id: houseId,
        template_id: templateId,
        assignee_member_id: assignee,
        chore_date: weekStart,
        slot: "evening",
        window_start: `${weekStart}T17:00:00Z`,
        window_end: `${weekStart}T23:00:00Z`,
        deadline: `${weekStart}T23:59:00Z`,
        effort_points: points,
        duration_min: 60,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  it("gives every member preferences the moment they exist", async () => {
    const { data } = await admin
      .from("notification_prefs")
      .select("member_id, settlement_updates, quiet_hours_start")
      .eq("house_id", houseId);

    expect((data ?? []).map((row) => row.member_id).sort()).toEqual(
      [raviMemberId, kumarMemberId].sort(),
    );
    expect(data![0].settlement_updates).toBe(true);
    expect(data![0].quiet_hours_start).toMatch(/^23:00/);
  });

  it("writes N-06 to everybody except the person who did the work", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 30);

    const done = await ravi.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(done.error).toBeNull();

    const kumarFeed = await feedOf(kumarMemberId, "N-06");
    const raviFeed = await feedOf(raviMemberId, "N-06");

    expect(kumarFeed).toHaveLength(1);
    expect(kumarFeed[0].title).toContain("notif-ravi");
    expect(kumarFeed[0].payload).toMatchObject({ assignment_id: assignmentId });
    // Confirming your own work is refused by the database, so asking you to is
    // an invitation to a dead end.
    expect(raviFeed).toHaveLength(0);
  });

  it("tells the assignee when their chore is confirmed", async () => {
    const assignmentId = await makeAssignment(raviMemberId, 25);
    await ravi.rpc("mark_chore_done", { p_assignment_id: assignmentId, p_photo_url: null });
    await kumar.rpc("confirm_chore", { p_assignment_id: assignmentId });

    const feed = await feedOf(raviMemberId, "N-07");
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].title).toBe("25 points added");
    expect(feed[0].body).toContain("notif-kumar");
  });

  it("replaces rather than adds when the same tag repeats inside ten minutes", async () => {
    const tag = `tag-test-${stamp}`;

    await admin.rpc("enqueue_notification", {
      p_house_id: houseId,
      p_member_id: kumarMemberId,
      p_type: "N-27",
      p_vars: { name: "First", room: "1" },
      p_tag: tag,
    });
    await admin.rpc("enqueue_notification", {
      p_house_id: houseId,
      p_member_id: kumarMemberId,
      p_type: "N-27",
      p_vars: { name: "Second", room: "2" },
      p_tag: tag,
    });

    const rows = (await feedOf(kumarMemberId)).filter((row) => row.tag === tag);
    expect(rows).toHaveLength(1);
    // The later row wins: it carries the fresher numbers.
    expect(rows[0].title).toBe("Second joined the house");
  });

  it("renders the copy from the template rather than storing a placeholder", async () => {
    const rows = await feedOf(kumarMemberId, "N-27");
    for (const row of rows) {
      expect(row.title).not.toContain("{");
      expect(row.body).not.toContain("{");
    }
  });

  it("keeps one member's feed out of another member's reach", async () => {
    const { data } = await kumar
      .from("notifications")
      .select("id")
      .eq("member_id", raviMemberId);

    // Not an error — an empty result. RLS filters rather than refuses, which is
    // what makes a forgotten filter in a route handler harmless.
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses to switch settlement off, however the request is phrased", async () => {
    const { error } = await kumar.rpc("set_notification_prefs", {
      p_expense_activity: false,
    });
    expect(error).toBeNull();

    // The column is not in the function's signature at all, so the only way to
    // try is directly against the table — which the policy allows, and the
    // function overrides on the next write.
    await kumar.from("notification_prefs").update({ settlement_updates: false }).eq(
      "member_id",
      kumarMemberId,
    );
    await kumar.rpc("set_notification_prefs", { p_house_activity: true });

    const { data } = await admin
      .from("notification_prefs")
      .select("settlement_updates, expense_activity")
      .eq("member_id", kumarMemberId)
      .single();

    expect(data!.settlement_updates).toBe(true);
    expect(data!.expense_activity).toBe(false);
  });

  it("still writes the feed row for a category that is switched off", async () => {
    // Kumar disabled expense activity in the test above. The row is written
    // regardless — the feed is the record, and the preference governs the push.
    const before = (await feedOf(kumarMemberId, "N-18")).length;

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();

    const { error } = await ravi.rpc("create_expense", {
      p_house_id: houseId,
      p_category_id: (category as { id: string }).id,
      p_amount_paise: 500000,
      p_expense_date: "2026-08-18",
      p_split_basis: "equal",
      p_splits: [
        { member_id: raviMemberId, share_paise: 250000 },
        { member_id: kumarMemberId, share_paise: 250000 },
      ],
      p_description: "Above the approval threshold on purpose",
    });
    expect(error).toBeNull();

    const after = await feedOf(kumarMemberId, "N-18");
    expect(after.length).toBe(before + 1);
    expect(after[0].title).toContain("₹5000");
    // The recipient's own share, not a dash: migration 043 defers the trigger
    // to commit so the split rows exist by the time it reads them.
    expect(after[0].body).toContain("Your share: ₹2500.00");
  });

  it("marks read, and marks all read, only for the caller", async () => {
    const { error } = await kumar.rpc("mark_all_notifications_read", {
      p_house_id: houseId,
    });
    expect(error).toBeNull();

    const kumarUnread = (await feedOf(kumarMemberId)).filter((row) => row.read_at === null);
    const raviUnread = (await feedOf(raviMemberId)).filter((row) => row.read_at === null);

    expect(kumarUnread).toHaveLength(0);
    expect(raviUnread.length).toBeGreaterThan(0);
  });

  it("keeps the enqueue path out of a browser's hands", async () => {
    const { error } = await kumar.rpc("enqueue_notification", {
      p_house_id: houseId,
      p_member_id: raviMemberId,
      p_type: "N-12",
      p_vars: { name: "Anybody", chore: "anything", points: "0", deficit: "0" },
    });

    // A member who could write another member's feed could accuse anybody of
    // anything, in the one place the house actually reads. This is D-20's
    // lesson applied before the fact rather than after.
    expect(error).not.toBeNull();
  });
});
