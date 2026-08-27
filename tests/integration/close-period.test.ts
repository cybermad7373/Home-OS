import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * The phase-3 acceptance criterion, run against a real database:
 *
 *   "Closing August with 8 members and 40 expenses produces at most 7 payments
 *    whose amounts net to exactly zero."
 *
 * The netting arithmetic is proved by property test in tests/unit. What this
 * suite proves is different and cannot be faked in memory: that the whole path
 * — expenses, splits, the deferred sum trigger, the close function, the stored
 * settlements — agrees with it end to end.
 *
 * It creates and deletes real users. Point it at a scratch project.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);
const describeIfConfigured = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();
const MEMBER_COUNT = 8;

/** A month that has certainly finished, so BR-103 does not block the close. */
function lastMonth(): string {
  const now = new Date();
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  return `${year}-${String(month).padStart(2, "0")}`;
}

describeIfConfigured("closing a month", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  let adminClient: SupabaseClient;
  let houseId: string;
  let periodId: string;
  let memberIds: string[] = [];
  const userIds: string[] = [];
  /** member id -> the email that signs that member in. */
  const emailByMember = new Map<string, string>();
  const period = lastMonth();

  beforeAll(async () => {
    // One admin who creates the house, then seven more joined straight to
    // active — approving each through the UI flow is phase 1's test, not this
    // one.
    for (let index = 0; index < MEMBER_COUNT; index += 1) {
      const email = `close${index}-${stamp}@houseos.dev`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: `Member ${index}` },
      });
      if (error) throw error;
      userIds.push(data.user!.id);
    }

    adminClient = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await adminClient.auth.signInWithPassword({
      email: `close0-${stamp}@houseos.dev`,
      password: PASSWORD,
    });

    const { data: house, error: houseError } = await adminClient.rpc("create_house", {
      p_name: `Close House ${stamp}`,
      p_address: null,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (houseError) throw houseError;
    houseId = (house as { house_id: string }[])[0].house_id;

    // Everybody joined at the start of the period being closed, so all eight
    // are participants in every split.
    const joined = `${period}-01`;
    await admin
      .from("house_members")
      .update({ joined_date: joined })
      .eq("house_id", houseId);

    for (const userId of userIds.slice(1)) {
      await admin.from("house_members").insert({
        house_id: houseId,
        user_id: userId,
        role: "member",
        status: "active",
        joined_date: joined,
      });
    }

    const { data: members } = await admin
      .from("house_members")
      .select("id, user_id")
      .eq("house_id", houseId)
      .order("id");

    memberIds = (members as { id: string }[]).map((row) => row.id);
    expect(memberIds).toHaveLength(MEMBER_COUNT);

    // Member ids are uuids and sort in their own order, which has nothing to do
    // with the order the accounts were created in. Map explicitly rather than
    // assuming the two line up.
    for (const row of members as { id: string; user_id: string }[]) {
      const index = userIds.indexOf(row.user_id);
      emailByMember.set(row.id, `close${index}-${stamp}@houseos.dev`);
    }

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .eq("name", "Groceries")
      .single();

    const { data: periodRow } = await admin
      .from("monthly_periods")
      .insert({ house_id: houseId, period })
      .select("id")
      .single();
    periodId = (periodRow as { id: string }).id;

    // Forty expenses with awkward amounts, so the remainder distribution is
    // exercised rather than avoided.
    for (let index = 0; index < 40; index += 1) {
      const payer = memberIds[index % 3]; // three people front everything
      const amountPaise = 100037 + index * 911;

      const { data: expense, error: expenseError } = await admin
        .from("expenses")
        .insert({
          house_id: houseId,
          period_id: periodId,
          paid_by_member_id: payer,
          category_id: (category as { id: string }).id,
          amount_paise: amountPaise,
          description: `Expense ${index}`,
          expense_date: `${period}-0${(index % 9) + 1}`,
          status: "approved",
          created_by: payer,
        })
        .select("id")
        .single();
      if (expenseError) throw expenseError;

      const base = Math.floor(amountPaise / MEMBER_COUNT);
      const remainder = amountPaise - base * MEMBER_COUNT;
      const shares = memberIds.map((memberId, position) => ({
        house_id: houseId,
        expense_id: (expense as { id: string }).id,
        member_id: memberId,
        share_paise: base + (position < remainder ? 1 : 0),
        guest_share_paise: 0,
      }));

      const { error: splitError } = await admin.from("expense_splits").insert(shares);
      if (splitError) throw splitError;
    }
  }, 180_000);

  afterAll(async () => {
    if (!configured || !houseId) return;
    await admin.from("settlements").delete().eq("house_id", houseId);
    await admin.from("member_period_balances").delete().eq("house_id", houseId);
    await admin.from("expenses").delete().eq("house_id", houseId);
    await admin.from("houses").delete().eq("id", houseId);
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 180_000);

  it("stores forty expenses whose splits sum exactly (BR-092)", async () => {
    const { data: expenses } = await admin
      .from("expenses")
      .select("id, amount_paise")
      .eq("house_id", houseId);

    const { data: splits } = await admin
      .from("expense_splits")
      .select("expense_id, share_paise, guest_share_paise")
      .eq("house_id", houseId);

    expect(expenses).toHaveLength(40);

    const byExpense = new Map<string, number>();
    for (const split of splits ?? []) {
      byExpense.set(
        split.expense_id,
        (byExpense.get(split.expense_id) ?? 0) + split.share_paise + split.guest_share_paise,
      );
    }

    for (const expense of expenses ?? []) {
      expect(byExpense.get(expense.id)).toBe(expense.amount_paise);
    }
  });

  it("refuses the close while an expense is awaiting approval (BR-102)", async () => {
    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();

    const { data: pending } = await admin
      .from("expenses")
      .insert({
        house_id: houseId,
        period_id: periodId,
        paid_by_member_id: memberIds[0],
        category_id: (category as { id: string }).id,
        amount_paise: 500000,
        expense_date: `${period}-05`,
        status: "pending_approval",
        created_by: memberIds[0],
      })
      .select("id")
      .single();

    const { error } = await adminClient.rpc("close_period", {
      p_period_id: periodId,
      p_balances: [],
      p_settlements: [],
    });

    expect(error?.message ?? "").toContain("APPROVALS_PENDING");

    await admin.from("expenses").delete().eq("id", (pending as { id: string }).id);
  });

  it("closes, nets to exactly zero, and produces at most n − 1 payments", async () => {
    const { data: expenses } = await admin
      .from("expenses")
      .select("amount_paise, paid_by_member_id")
      .eq("house_id", houseId)
      .eq("status", "approved");

    const { data: splits } = await admin
      .from("expense_splits")
      .select("member_id, share_paise, guest_share_paise")
      .eq("house_id", houseId);

    const paid = new Map<string, number>();
    for (const expense of expenses ?? []) {
      paid.set(
        expense.paid_by_member_id,
        (paid.get(expense.paid_by_member_id) ?? 0) + expense.amount_paise,
      );
    }

    const share = new Map<string, number>();
    for (const split of splits ?? []) {
      share.set(
        split.member_id,
        (share.get(split.member_id) ?? 0) + split.share_paise + split.guest_share_paise,
      );
    }

    const balances = memberIds.map((memberId) => {
      const total_paid_paise = paid.get(memberId) ?? 0;
      const fair_share_paise = share.get(memberId) ?? 0;
      const net = total_paid_paise - fair_share_paise;
      return {
        member_id: memberId,
        total_paid_paise,
        fair_share_paise,
        expense_net_paise: net,
        penalty_owed_paise: 0,
        penalty_credit_paise: 0,
        final_net_paise: net,
      };
    });

    expect(balances.reduce((sum, balance) => sum + balance.final_net_paise, 0)).toBe(0);

    // Greedy netting, the same rule as lib/domain/settlement/netting.ts.
    const debtors = balances
      .filter((balance) => balance.final_net_paise < 0)
      .map((balance) => ({ id: balance.member_id, amount: -balance.final_net_paise }))
      .sort((a, b) => b.amount - a.amount);
    const creditors = balances
      .filter((balance) => balance.final_net_paise > 0)
      .map((balance) => ({ id: balance.member_id, amount: balance.final_net_paise }))
      .sort((a, b) => b.amount - a.amount);

    const payments: { from_member_id: string; to_member_id: string; amount_paise: number }[] =
      [];
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
      payments.push({
        from_member_id: debtors[debtorIndex].id,
        to_member_id: creditors[creditorIndex].id,
        amount_paise: amount,
      });
      debtors[debtorIndex].amount -= amount;
      creditors[creditorIndex].amount -= amount;
      if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
      if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
    }

    expect(payments.length).toBeLessThanOrEqual(MEMBER_COUNT - 1);

    const { data: status, error } = await adminClient.rpc("close_period", {
      p_period_id: periodId,
      p_balances: balances,
      p_settlements: payments,
    });

    expect(error).toBeNull();
    expect(status).toBe("closing");

    const { data: stored } = await admin
      .from("settlements")
      .select("amount_paise, from_member_id, to_member_id")
      .eq("period_id", periodId);

    expect(stored).toHaveLength(payments.length);

    // Every payment moves money between two different people, and the money
    // each member receives minus what they send equals their net exactly.
    const movement = new Map<string, number>(memberIds.map((id) => [id, 0]));
    for (const settlement of stored ?? []) {
      expect(settlement.amount_paise).toBeGreaterThan(0);
      expect(settlement.from_member_id).not.toBe(settlement.to_member_id);
      movement.set(
        settlement.from_member_id,
        (movement.get(settlement.from_member_id) ?? 0) - settlement.amount_paise,
      );
      movement.set(
        settlement.to_member_id,
        (movement.get(settlement.to_member_id) ?? 0) + settlement.amount_paise,
      );
    }

    for (const balance of balances) {
      expect(movement.get(balance.member_id)).toBe(balance.final_net_paise);
    }

    expect([...movement.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  }, 60_000);

  it("refuses balances that do not net to zero (BR-107)", async () => {
    const { error } = await adminClient.rpc("close_period", {
      p_period_id: periodId,
      p_balances: [
        {
          member_id: memberIds[0],
          total_paid_paise: 1000,
          fair_share_paise: 0,
          expense_net_paise: 1000,
          penalty_owed_paise: 0,
          penalty_credit_paise: 0,
          final_net_paise: 1000,
        },
      ],
      p_settlements: [],
    });

    expect(error?.message ?? "").toContain("NETS_NONZERO");
  });

  it("locks the month only when every payment is confirmed (BR-105)", async () => {
    const { data: settlements } = await admin
      .from("settlements")
      .select("id, from_member_id, to_member_id")
      .eq("period_id", periodId);

    expect((settlements ?? []).length).toBeGreaterThan(0);

    for (const [index, settlement] of (settlements ?? []).entries()) {
      const payer = createClient(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await payer.auth.signInWithPassword({
        email: emailByMember.get(settlement.from_member_id)!,
        password: PASSWORD,
      });

      // BR-109 — the receiver cannot mark it paid on the payer's behalf.
      const payee = createClient(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await payee.auth.signInWithPassword({
        email: emailByMember.get(settlement.to_member_id)!,
        password: PASSWORD,
      });

      if (index === 0) {
        const wrongWay = await payee.rpc("mark_settlement_paid", {
          p_settlement_id: settlement.id,
          p_paid: true,
        });
        expect(wrongWay.error?.message ?? "").toContain("NOT_THE_PAYER");

        const alsoWrong = await payer.rpc("confirm_settlement", {
          p_settlement_id: settlement.id,
        });
        expect(alsoWrong.error?.message ?? "").toContain("NOT_THE_PAYEE");
      }

      // Asserted, not fired and forgotten. An unchecked call here is how the
      // enum-cast defect in mark_settlement_paid survived its first test run.
      const marked = await payer.rpc("mark_settlement_paid", {
        p_settlement_id: settlement.id,
        p_paid: true,
      });
      expect(marked.error).toBeNull();
      expect(marked.data).toBe("marked_paid");

      const { data: midway } = await admin
        .from("settlements")
        .select("status, marked_paid_at")
        .eq("id", settlement.id)
        .single();
      expect((midway as { status: string }).status).toBe("marked_paid");
      expect((midway as { marked_paid_at: string | null }).marked_paid_at).not.toBeNull();

      // BR-110 — the payer may take the assertion back until it is confirmed.
      if (index === 0) {
        const undone = await payer.rpc("mark_settlement_paid", {
          p_settlement_id: settlement.id,
          p_paid: false,
        });
        expect(undone.error).toBeNull();
        expect(undone.data).toBe("pending");

        await payer.rpc("mark_settlement_paid", {
          p_settlement_id: settlement.id,
          p_paid: true,
        });
      }

      const { data: result, error } = await payee.rpc("confirm_settlement", {
        p_settlement_id: settlement.id,
      });
      expect(error).toBeNull();

      const row = Array.isArray(result) ? result[0] : result;
      const isLast = index === (settlements ?? []).length - 1;
      expect((row as { period_locked: boolean }).period_locked).toBe(isLast);
    }

    const { data: closed } = await admin
      .from("monthly_periods")
      .select("status, locked_at")
      .eq("id", periodId)
      .single();

    expect((closed as { status: string }).status).toBe("closed");
    expect((closed as { locked_at: string | null }).locked_at).not.toBeNull();
  }, 120_000);

  it("rejects a write to a closed period at the database level (BR-106, SEC-11)", async () => {
    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();

    const { error } = await admin.from("expenses").insert({
      house_id: houseId,
      period_id: periodId,
      paid_by_member_id: memberIds[0],
      category_id: (category as { id: string }).id,
      amount_paise: 100,
      expense_date: `${period}-05`,
      status: "approved",
      created_by: memberIds[0],
    });

    // Not a policy and not application logic: the service role bypasses RLS
    // entirely and is still refused, because the trigger does not care who asks.
    expect(error?.message ?? "").toContain("PERIOD_CLOSED");
  });
});
