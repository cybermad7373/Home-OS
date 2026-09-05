import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Migration 092 — the retention sweep.
 *
 * Two claims, and the second matters more than the first. Old notifications and
 * dead invitations go; **the ledger and the work record do not**, ever, on any
 * timer. A retention job that quietly aged out an expense would be data loss
 * wearing a privacy hat, and the only way to know it does not is to put one in
 * front of it and run the sweep.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/retention
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

const admin = configured
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : (null as never);

const migrated = configured
  ? await admin.rpc("purge_expired_records").then(({ error }) => !error)
  : false;

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

describeIfReady("the retention sweep", () => {
  const userIds: string[] = [];
  const houseIds: string[] = [];

  async function signUp(label: string): Promise<{ userId: string; client: SupabaseClient }> {
    const email = `retain-${label}-${stamp}@houseos.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;
    userIds.push(data.user!.id);

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw signInError;
    return { userId: data.user!.id, client };
  }

  afterAll(async () => {
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("keeps the ledger and the work record, whatever their age", async () => {
    const owner = await signUp("owner");
    const { data: created, error: houseError } = await owner.client.rpc("create_house", {
      p_name: `Retention Home ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (houseError) throw houseError;
    const houseId = (created as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);

    const { data: member } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .eq("user_id", owner.userId)
      .single();
    const memberId = (member as { id: string }).id;

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();

    // Two years old, which is older than every window in the sweep.
    const longAgo = new Date(Date.now() - 730 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: expenseId, error: expenseError } = await owner.client.rpc("create_expense", {
      p_house_id: houseId,
      p_category_id: (category as { id: string }).id,
      p_amount_paise: 31400,
      p_expense_date: new Date().toISOString().slice(0, 10),
      p_split_basis: "equal",
      p_splits: [{ member_id: memberId, share_paise: 31400, guest_share_paise: 0 }],
      p_description: "Kept forever",
      p_paid_by_member_id: memberId,
    });
    if (expenseError) throw expenseError;

    // Backdated after the fact: `create_expense` refuses a date 180 days old,
    // which is a different rule and one this test is not about.
    await admin
      .from("expenses")
      .update({ created_at: daysAgo(730), expense_date: longAgo })
      .eq("id", expenseId as unknown as string);

    const { error } = await admin.rpc("purge_expired_records");
    expect(error).toBeNull();

    const { data: survivor } = await admin
      .from("expenses")
      .select("amount_paise")
      .eq("id", expenseId as unknown as string)
      .maybeSingle();
    expect(
      (survivor as { amount_paise: number } | null)?.amount_paise,
      "a two-year-old expense is still a household's record",
    ).toBe(31400);
  });

  it("deletes a read notification after 180 days and keeps a recent one", async () => {
    const owner = await signUp("reader");
    const { data: created } = await owner.client.rpc("create_house", {
      p_name: `Notice Home ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    const houseId = (created as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);

    const { data: member } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .eq("user_id", owner.userId)
      .single();
    const memberId = (member as { id: string }).id;

    const rows = [
      { label: "old-read", created_at: daysAgo(200), read_at: daysAgo(199), gone: true },
      { label: "old-unread", created_at: daysAgo(400), read_at: null, gone: true },
      { label: "recent-read", created_at: daysAgo(10), read_at: daysAgo(9), gone: false },
      // Unread and eleven months old: still inside the year, still there.
      { label: "unread-elevenish", created_at: daysAgo(330), read_at: null, gone: false },
    ];

    const { data: inserted, error: insertError } = await admin
      .from("notifications")
      .insert(
        rows.map((row) => ({
          house_id: houseId,
          member_id: memberId,
          type: "N-01",
          title: "Retention",
          body: row.label,
          created_at: row.created_at,
          read_at: row.read_at,
        })),
      )
      .select("id, body");
    if (insertError) throw insertError;

    const idOf = (label: string) =>
      (inserted as { id: string; body: string }[]).find((row) => row.body === label)!.id;

    const { error } = await admin.rpc("purge_expired_records");
    expect(error).toBeNull();

    for (const row of rows) {
      const { data } = await admin
        .from("notifications")
        .select("id")
        .eq("id", idOf(row.label))
        .maybeSingle();
      expect(Boolean(data), `${row.label} should be ${row.gone ? "gone" : "kept"}`).toBe(!row.gone);
    }
  });

  it("deletes an invitation that died a quarter ago and never a live one", async () => {
    const owner = await signUp("inviter");
    const { data: created } = await owner.client.rpc("create_house", {
      p_name: `Invite Home ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    const houseId = (created as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);

    const { data: member } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .eq("user_id", owner.userId)
      .single();
    const memberId = (member as { id: string }).id;

    /*
      At most one live link per Home is a database fact — `uq_invitation_live`
      is a unique index on `house_id where revoked_at is null` — so the expired
      case has to be the Home's own link rather than a fourth row beside it.
      Which is the realistic shape anyway: a Home has one link, and it expires.
    */
    const { error: expireError } = await admin
      .from("invitations")
      .update({ expires_at: daysAgo(120) })
      .eq("house_id", houseId)
      .is("revoked_at", null);
    if (expireError) throw expireError;

    const { error: insertError } = await admin.from("invitations").insert([
      { house_id: houseId, token: `revoked-old-${stamp}`, created_by: memberId, revoked_at: daysAgo(120) },
      { house_id: houseId, token: `revoked-recent-${stamp}`, created_by: memberId, revoked_at: daysAgo(2) },
    ]);
    if (insertError) throw insertError;

    const { error } = await admin.rpc("purge_expired_records");
    expect(error).toBeNull();

    const { data: left } = await admin
      .from("invitations")
      .select("token")
      .eq("house_id", houseId);
    const tokens = (left as { token: string }[]).map((row) => row.token);

    // The Home's own link, expired four months ago, and a revocation from the
    // same distance: both gone.
    expect(tokens).not.toContain(`revoked-old-${stamp}`);
    expect(tokens.length, "the expired live link went too").toBe(1);
    // Two days dead is not ninety.
    expect(tokens).toContain(`revoked-recent-${stamp}`);
  });

  it("is not callable by a member", async () => {
    const member = await signUp("nosy");
    const { error } = await member.client.rpc("purge_expired_records");
    expect(error).toBeTruthy();
  });
});
