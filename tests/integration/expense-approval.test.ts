import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * The phase-2 acceptance criterion, run rather than asserted:
 *
 *   "An expense above the threshold cannot be approved by its payer — blocked
 *    at the database, verified by test."
 *
 * This suite exists because of a defect it would have caught. The original
 * tests around approval only proved the refusals — self-approval, wrong state —
 * and every refusal returns before the UPDATE that was broken. A test that only
 * shows the wrong thing failing does not show the right thing working.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);
const describeIfConfigured = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

describeIfConfigured("expense approval", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  let payer: SupabaseClient;
  let peer: SupabaseClient;
  let houseId: string;
  let payerMemberId: string;
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
    await client.auth.signInWithPassword({ email, password: PASSWORD });
    userIds.push(data.user!.id);
    return { id: data.user!.id, client };
  }

  beforeAll(async () => {
    const first = await makeUser("approve-payer");
    const second = await makeUser("approve-peer");
    payer = first.client;
    peer = second.client;

    const { data: house, error } = await payer.rpc("create_house", {
      p_name: `Approval House ${stamp}`,
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
    payerMemberId = (members as { id: string; user_id: string }[]).find(
      (row) => row.user_id === first.id,
    )!.id;

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .eq("name", "Groceries")
      .single();
    categoryId = (category as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    if (!configured || !houseId) return;
    await admin.from("expenses").delete().eq("house_id", houseId);
    await admin.from("houses").delete().eq("id", houseId);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  }, 120_000);

  /** Above the default ₹1,000 threshold, so it lands pending. */
  async function createLargeExpense(amountPaise = 500000): Promise<string> {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { data: memberRows } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", houseId);

    const ids = (memberRows as { id: string }[]).map((row) => row.id).sort();
    const base = Math.floor(amountPaise / ids.length);
    const remainder = amountPaise - base * ids.length;

    const { data, error } = await payer.rpc("create_expense", {
      p_category_id: categoryId,
      p_amount_paise: amountPaise,
      p_expense_date: today,
      p_split_basis: "equal",
      p_splits: ids.map((memberId, index) => ({
        member_id: memberId,
        share_paise: base + (index < remainder ? 1 : 0),
        guest_share_paise: 0,
      })),
      p_description: "Big shop",
      p_paid_by_member_id: payerMemberId,
    });

    if (error) throw error;
    return data as unknown as string;
  }

  it("holds an expense above the threshold for approval (BR-084)", async () => {
    const expenseId = await createLargeExpense();

    const { data } = await admin
      .from("expenses")
      .select("status")
      .eq("id", expenseId)
      .single();

    expect((data as { status: string }).status).toBe("pending_approval");
  });

  it("approves when somebody other than the payer says so", async () => {
    const expenseId = await createLargeExpense();

    const { data, error } = await peer.rpc("approve_expense", {
      p_expense_id: expenseId,
      p_approve: true,
      p_reason: null,
    });

    expect(error).toBeNull();
    expect(data).toBe("approved");

    const { data: row } = await admin
      .from("expenses")
      .select("status, approved_by, approved_at")
      .eq("id", expenseId)
      .single();

    const approved = row as {
      status: string;
      approved_by: string | null;
      approved_at: string | null;
    };
    expect(approved.status).toBe("approved");
    expect(approved.approved_by).not.toBeNull();
    expect(approved.approved_by).not.toBe(payerMemberId);
    expect(approved.approved_at).not.toBeNull();
  });

  it("rejects with a reason, and keeps the reason", async () => {
    const expenseId = await createLargeExpense();

    const { data, error } = await peer.rpc("approve_expense", {
      p_expense_id: expenseId,
      p_approve: false,
      p_reason: "That was for your own trip, not the house",
    });

    expect(error).toBeNull();
    expect(data).toBe("rejected");

    const { data: row } = await admin
      .from("expenses")
      .select("status, rejection_reason")
      .eq("id", expenseId)
      .single();

    const rejected = row as { status: string; rejection_reason: string | null };
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection_reason).toContain("your own trip");
  });

  it("refuses the payer approving their own (BR-085)", async () => {
    const expenseId = await createLargeExpense();

    const { error } = await payer.rpc("approve_expense", {
      p_expense_id: expenseId,
      p_approve: true,
      p_reason: null,
    });

    expect(error?.message ?? "").toContain("SELF_APPROVAL");
  });

  it("refuses self-approval at the database, even with the service role", async () => {
    const expenseId = await createLargeExpense();

    // The service role bypasses RLS entirely. The check constraint does not
    // care who is asking.
    const { error } = await admin
      .from("expenses")
      .update({ approved_by: payerMemberId, status: "approved" })
      .eq("id", expenseId);

    expect(error?.message ?? "").toContain("no_self_approve");
  });

  it("refuses a second decision on an already-resolved expense (BR-086)", async () => {
    const expenseId = await createLargeExpense();

    await peer.rpc("approve_expense", {
      p_expense_id: expenseId,
      p_approve: true,
      p_reason: null,
    });

    const { error } = await peer.rpc("approve_expense", {
      p_expense_id: expenseId,
      p_approve: false,
      p_reason: "Changed my mind",
    });

    expect(error?.message ?? "").toContain("ALREADY_RESOLVED");
  });

  it("keeps a pending expense out of everybody's totals until approved", async () => {
    const expenseId = await createLargeExpense(700000);

    const { data: before } = await admin
      .from("expenses")
      .select("amount_paise")
      .eq("house_id", houseId)
      .eq("status", "approved");
    const approvedBefore = (before ?? []).reduce(
      (sum, row) => sum + row.amount_paise,
      0,
    );

    await peer.rpc("approve_expense", {
      p_expense_id: expenseId,
      p_approve: true,
      p_reason: null,
    });

    const { data: after } = await admin
      .from("expenses")
      .select("amount_paise")
      .eq("house_id", houseId)
      .eq("status", "approved");
    const approvedAfter = (after ?? []).reduce((sum, row) => sum + row.amount_paise, 0);

    expect(approvedAfter - approvedBefore).toBe(700000);
  });
});
