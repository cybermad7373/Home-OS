import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * The analytics phase's alerting criterion, run rather than asserted:
 *
 *   "Budget breach produces an alert on the day it happens."
 *
 * `check_budget_thresholds` is plain SQL on pg_cron — no Edge Function and no
 * route handler — so the only place it can be proved is against a database.
 * What matters is not that it can write a row but that it writes one at 80 per
 * cent, writes a second one at 100, and never writes the same one twice: an
 * alert repeated every evening for a fortnight is how a house turns
 * notifications off.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);
const describeIfConfigured = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface AlertRow {
  member_id: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
}

/** ₹1,000. Small enough that a few ordinary expenses cross both thresholds. */
const BUDGET_PAISE = 100000;

describeIfConfigured("budget alerts", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  let payer: SupabaseClient;
  let peer: SupabaseClient;
  let houseId: string;
  let payerMemberId: string;
  let memberIds: string[] = [];
  let categoryId: string;
  const userIds: string[] = [];

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
    const first = await makeUser("budget-payer");
    const second = await makeUser("budget-peer");
    payer = first.client;
    peer = second.client;

    const { data: house, error } = await payer.rpc("create_house", {
      p_name: `Budget House ${stamp}`,
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
    });

    const { data: members } = await admin
      .from("house_members")
      .select("id, user_id")
      .eq("house_id", houseId);
    const rows = members as { id: string; user_id: string }[];
    payerMemberId = rows.find((row) => row.user_id === first.id)!.id;
    memberIds = rows.map((row) => row.id);

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .eq("name", "Groceries")
      .single();
    categoryId = (category as { id: string }).id;

    // Every other seeded category is left without a budget, so nothing but this
    // one can produce an alert for this house.
    await admin
      .from("expense_categories")
      .update({ monthly_budget_paise: null })
      .eq("house_id", houseId)
      .neq("id", categoryId);
    await admin
      .from("expense_categories")
      .update({ monthly_budget_paise: BUDGET_PAISE })
      .eq("id", categoryId);
  }, 120_000);

  afterAll(async () => {
    if (!configured || !houseId) return;
    await admin.from("notifications").delete().eq("house_id", houseId);
    await admin.from("expenses").delete().eq("house_id", houseId);
    await admin.from("houses").delete().eq("id", houseId);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  }, 120_000);

  /**
   * The job compares against the database's `current_date`, so an expense has
   * to be dated in that day's month rather than the house's. UTC is never ahead
   * of Asia/Kolkata, so this date is never rejected as being in the future.
   */
  function jobToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async function spend(amountPaise: number): Promise<void> {
    const base = Math.floor(amountPaise / memberIds.length);
    const remainder = amountPaise - base * memberIds.length;

    const { data, error } = await payer.rpc("create_expense", {
      p_house_id: houseId,
      p_category_id: categoryId,
      p_amount_paise: amountPaise,
      p_expense_date: jobToday(),
      p_split_basis: "equal",
      p_splits: [...memberIds].sort().map((memberId, index) => ({
        member_id: memberId,
        share_paise: base + (index < remainder ? 1 : 0),
        guest_share_paise: 0,
      })),
      p_description: "Shopping",
      p_paid_by_member_id: payerMemberId,
    });
    if (error) throw error;

    const expenseId = data as unknown as string;
    const { data: row } = await admin
      .from("expenses")
      .select("status")
      .eq("id", expenseId)
      .single();

    // Only approved money counts against a budget, so anything that landed
    // above the house's approval threshold has to be approved by the other one.
    if ((row as { status: string }).status !== "approved") {
      const { error: approvalError } = await peer.rpc("approve_expense", {
        p_expense_id: expenseId,
        p_approve: true,
        p_reason: null,
      });
      if (approvalError) throw approvalError;
    }
  }

  async function runJob(): Promise<void> {
    const { error } = await admin.rpc("check_budget_thresholds");
    if (error) throw error;
  }

  async function alerts(): Promise<AlertRow[]> {
    const { data, error } = await admin
      .from("notifications")
      .select("member_id, title, body, payload")
      .eq("house_id", houseId)
      .eq("type", "N-21")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as AlertRow[];
  }

  it("says nothing while the category is comfortably inside its budget", async () => {
    await spend(70000); // ₹700 of ₹1,000 — 70 per cent.
    await runJob();

    expect(await alerts()).toHaveLength(0);
  });

  it("alerts every member on the day spending crosses four fifths", async () => {
    await spend(15000); // ₹850 in total — 85 per cent.
    await runJob();

    const rows = await alerts();
    expect(rows.map((row) => row.member_id).sort()).toEqual([...memberIds].sort());
    expect(rows[0].payload).toMatchObject({ category_id: categoryId, threshold: 80 });
    expect(rows[0].title).toContain("85%");
    expect(rows[0].body).toContain("850");
  });

  it("does not repeat the same threshold for the rest of the month", async () => {
    const before = (await alerts()).length;
    await spend(2000); // ₹870 — still the same side of both thresholds.
    await runJob();
    await runJob();

    expect(await alerts()).toHaveLength(before);
  });

  it("alerts again, once, when the budget itself is passed", async () => {
    await spend(20000); // ₹1,070 — over budget.
    await runJob();
    await runJob();

    const crossings = (await alerts()).filter((row) => row.payload.threshold === 100);
    expect(crossings.map((row) => row.member_id).sort()).toEqual([...memberIds].sort());
    expect(crossings[0].title).toContain("107%");
  });
});
