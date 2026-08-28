import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  computeBalances,
  minimiseTransfers,
  type ComputedBalance,
} from "@/lib/domain/settlement/netting";
import { selectParticipants } from "@/lib/domain/governance/participants";
import type { GovernanceMember, GovernancePolicy } from "@/lib/domain/governance/types";

config({ path: ".env.local", quiet: true });

/**
 * Phase 11 slice 5, run against a real database: closing a month is the Home's
 * decision, not one Admin's (D-59), and the money is written at apply time from
 * apply-time numbers (migration 071).
 *
 * The netting itself is proved without a database in `tests/unit/netting.test.ts`.
 * What this suite proves is the part that only exists once there is a Postgres:
 * that a single member's responses cannot complete the close, that the effect
 * refuses numbers that do not add up even when the caller holds the service-role
 * key, and that an adjustment moves money between two members without creating
 * any.
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

/** A month that has certainly finished, so BR-103 does not block the close. */
function lastMonth(): string {
  const now = new Date();
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  return `${year}-${String(month).padStart(2, "0")}`;
}

interface Actor {
  userId: string;
  email: string;
  memberId: string;
  client: SupabaseClient;
}

describeIfConfigured("the governed close", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  /** Five adults: an Admin, a Co-Admin, and three ordinary members. */
  let lead: Actor;
  let coLead: Actor;
  let one: Actor;
  let two: Actor;
  let three: Actor;
  /** A member of a different Home entirely, for the isolation check. */
  let outsider: Actor;

  let houseId: string;
  let otherHouseId: string;
  let periodId: string;
  const period = lastMonth();
  const houseIds: string[] = [];
  const userIds: string[] = [];

  let policy: GovernancePolicy;
  let members: GovernanceMember[];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `close-gov-${label}-${stamp}@houseos.test`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;
    userIds.push(created.user!.id);

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    return { userId: created.user!.id, email, client };
  }

  async function makeHome(actor: Omit<Actor, "memberId">, name: string) {
    const { data, error } = await actor.client.rpc("create_house", {
      p_name: name,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    const id = (data as { house_id: string }[])[0].house_id;
    houseIds.push(id);
    return id;
  }

  async function memberIdOf(house: string, userId: string): Promise<string> {
    const { data, error } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", house)
      .eq("user_id", userId)
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  /** Join through the real flow, then set the role with the Admin's own client. */
  async function join(
    actor: Omit<Actor, "memberId">,
    role: "co_admin" | "member",
  ): Promise<string> {
    const { data: invite, error: inviteError } = await admin
      .from("invitations")
      .select("token")
      .eq("house_id", houseId)
      .is("revoked_at", null)
      .single();
    if (inviteError) throw inviteError;

    const { error: requestError } = await actor.client.rpc("request_join", {
      p_token: (invite as { token: string }).token,
      p_message: null,
    });
    if (requestError) throw requestError;

    const { data: request } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", houseId)
      .eq("user_id", actor.userId)
      .eq("status", "requested")
      .single();

    const { error: acceptError } = await lead.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });
    if (acceptError) throw acceptError;

    const memberId = await memberIdOf(houseId, actor.userId);
    if (role !== "member") {
      // The privilege trigger reads auth.uid(), so this has to come from a
      // signed-in Admin. The service-role key is refused here, on purpose.
      const { error: roleError } = await lead.client
        .from("house_members")
        .update({ role })
        .eq("id", memberId);
      if (roleError) throw roleError;
    }
    return memberId;
  }

  /** The requirement the app's own selector would produce for this proposal. */
  function requirementFor(type: "close_settlement" | "reopen_settlement" | "balance_adjustment") {
    const selection = selectParticipants({
      proposal: { type, proposerId: lead.memberId },
      members,
      policy,
      autoConfirmHours: 48,
    });
    if ("refusal" in selection) throw new Error(selection.refusal);
    return selection.requirement;
  }

  async function propose(
    type: "close_settlement" | "reopen_settlement" | "balance_adjustment",
    payload: Record<string, unknown>,
  ): Promise<string> {
    const requirement = requirementFor(type);
    const { data, error } = await lead.client.rpc("create_decision", {
      p_house_id: houseId,
      p_type: type,
      p_level: requirement.level,
      p_participants: requirement.participants.map((participant) => ({
        member_id: participant.memberId,
        capacity: participant.capacity,
        is_mandatory: participant.isMandatory,
      })),
      p_required_approvals: requirement.requiredApprovals,
      p_required_acks: requirement.requiredAcks,
      p_subject_type: "period",
      p_subject_id: periodId,
      p_subject_member_id: null,
      p_payload: payload,
      p_reason: `Closing ${period}, and saying so at adequate length`,
      p_deadline: null,
      p_supersedes_id: null,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [data];
    return (rows[0] as { id: string }).id;
  }

  async function respond(
    actor: Actor,
    decisionId: string,
    capacity: "approver" | "acknowledger",
  ) {
    const { error } = await actor.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: actor.memberId,
      capacity,
      response: capacity === "approver" ? "approve" : "acknowledge",
    });
    if (error) throw error;
  }

  async function statusOf(decisionId: string): Promise<string> {
    const { data, error } = await admin
      .from("decisions")
      .select("status")
      .eq("id", decisionId)
      .single();
    if (error) throw error;
    return (data as { status: string }).status;
  }

  /** The month's arithmetic, computed the way `lib/data/settlement.ts` does. */
  async function apply_time_numbers(): Promise<{
    balances: ComputedBalance[];
    input: Record<string, unknown>;
  }> {
    const { data: expenses } = await admin
      .from("expenses")
      .select("amount_paise, paid_by_member_id")
      .eq("period_id", periodId)
      .eq("status", "approved");

    const { data: splits } = await admin
      .from("expense_splits")
      .select("member_id, share_paise, guest_share_paise, expenses!inner(period_id, status)")
      .eq("house_id", houseId);

    const paid = new Map<string, number>();
    for (const row of (expenses ?? []) as { amount_paise: number; paid_by_member_id: string }[]) {
      paid.set(row.paid_by_member_id, (paid.get(row.paid_by_member_id) ?? 0) + row.amount_paise);
    }

    const share = new Map<string, number>();
    type SplitRow = {
      member_id: string;
      share_paise: number;
      guest_share_paise: number;
      expenses: { period_id: string; status: string } | null;
    };
    for (const row of (splits ?? []) as unknown as SplitRow[]) {
      if (row.expenses?.period_id !== periodId) continue;
      if (row.expenses?.status !== "approved") continue;
      share.set(
        row.member_id,
        (share.get(row.member_id) ?? 0) + row.share_paise + row.guest_share_paise,
      );
    }

    const balances = computeBalances(
      members.map((member) => ({
        memberId: member.id,
        paidPaise: paid.get(member.id) ?? 0,
        fairSharePaise: share.get(member.id) ?? 0,
      })),
    );
    const payments = minimiseTransfers(balances);

    return {
      balances,
      input: {
        balances: balances.map((balance) => ({
          member_id: balance.memberId,
          total_paid_paise: balance.paidPaise,
          fair_share_paise: balance.fairSharePaise,
          expense_net_paise: balance.expenseNetPaise,
          penalty_owed_paise: 0,
          penalty_credit_paise: 0,
          final_net_paise: balance.finalNetPaise,
        })),
        settlements: payments.map((payment) => ({
          from_member_id: payment.fromMemberId,
          to_member_id: payment.toMemberId,
          amount_paise: payment.amountPaise,
          upi_link: null,
        })),
        penalties: [],
      },
    };
  }

  beforeAll(async () => {
    const leadUser = await signUp("lead");
    houseId = await makeHome(leadUser, `Governed Close ${stamp}`);
    lead = { ...leadUser, memberId: await memberIdOf(houseId, leadUser.userId) };

    const coLeadUser = await signUp("colead");
    coLead = { ...coLeadUser, memberId: await join(coLeadUser, "co_admin") };
    const oneUser = await signUp("one");
    one = { ...oneUser, memberId: await join(oneUser, "member") };
    const twoUser = await signUp("two");
    two = { ...twoUser, memberId: await join(twoUser, "member") };
    const threeUser = await signUp("three");
    three = { ...threeUser, memberId: await join(threeUser, "member") };

    const outsiderUser = await signUp("outsider");
    otherHouseId = await makeHome(outsiderUser, `Other Home ${stamp}`);
    outsider = { ...outsiderUser, memberId: await memberIdOf(otherHouseId, outsiderUser.userId) };

    // Everybody was here for the whole month being closed.
    await admin
      .from("house_members")
      .update({ joined_date: `${period}-01` })
      .eq("house_id", houseId);

    const { data: policyRow } = await admin
      .from("governance_policy")
      .select("*")
      .eq("house_id", houseId)
      .single();
    const row = policyRow as Record<string, never> & {
      critical_requires_coadmin: boolean;
      critical_member_rule: "count" | "proportion";
      critical_member_value: number;
      governance_requires_all: boolean;
      absence_approver_roles: GovernancePolicy["absenceApproverRoles"];
      join_approver_roles: GovernancePolicy["joinApproverRoles"];
      expense_approvals_required: number;
      decision_deadline_days: number;
      absence_deadline_hours: number;
    };
    policy = {
      criticalRequiresCoadmin: row.critical_requires_coadmin,
      criticalMemberRule: row.critical_member_rule,
      criticalMemberValue: row.critical_member_value,
      governanceRequiresAll: row.governance_requires_all,
      absenceApproverRoles: row.absence_approver_roles,
      joinApproverRoles: row.join_approver_roles,
      expenseApprovalsRequired: row.expense_approvals_required,
      decisionDeadlineDays: row.decision_deadline_days,
      absenceDeadlineHours: row.absence_deadline_hours,
    };

    const { data: memberRows } = await admin
      .from("house_members")
      .select("id, role, status, member_kind")
      .eq("house_id", houseId);
    members = (
      memberRows as { id: string; role: string; status: string; member_kind: string }[]
    ).map((member) => ({
      id: member.id,
      role: member.role as GovernanceMember["role"],
      status: member.status as GovernanceMember["status"],
      kind: member.member_kind as GovernanceMember["kind"],
    }));
    expect(members).toHaveLength(5);

    const { data: periodRow, error: periodError } = await admin
      .from("monthly_periods")
      .insert({ house_id: houseId, period })
      .select("id")
      .single();
    if (periodError) throw periodError;
    periodId = (periodRow as { id: string }).id;

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();

    // Three expenses with awkward amounts, all fronted by the Admin, so the
    // remainder distribution is exercised rather than avoided.
    for (let index = 0; index < 3; index += 1) {
      const amountPaise = 250037 + index * 911;
      const { data: expense, error: expenseError } = await admin
        .from("expenses")
        .insert({
          house_id: houseId,
          period_id: periodId,
          paid_by_member_id: lead.memberId,
          category_id: (category as { id: string }).id,
          amount_paise: amountPaise,
          description: `Expense ${index}`,
          expense_date: `${period}-0${index + 1}`,
          status: "approved",
          created_by: lead.memberId,
        })
        .select("id")
        .single();
      if (expenseError) throw expenseError;

      const base = Math.floor(amountPaise / members.length);
      const remainder = amountPaise - base * members.length;
      const { error: splitError } = await admin.from("expense_splits").insert(
        members.map((member, position) => ({
          house_id: houseId,
          expense_id: (expense as { id: string }).id,
          member_id: member.id,
          share_paise: base + (position < remainder ? 1 : 0),
          guest_share_paise: 0,
        })),
      );
      if (splitError) throw splitError;
    }
  }, 180_000);

  afterAll(async () => {
    if (!configured) return;
    for (const house of houseIds) {
      await admin.from("balance_adjustments").delete().eq("house_id", house);
      await admin.from("settlements").delete().eq("house_id", house);
      await admin.from("member_period_balances").delete().eq("house_id", house);
      await admin.from("expenses").delete().eq("house_id", house);
      await admin.from("houses").delete().eq("id", house);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 180_000);

  it("asks the Co-Admin by name and three of the Home in total", () => {
    const requirement = requirementFor("close_settlement");

    // Section 7's flow: the Admin proposes, the Co-Admin acknowledges by name,
    // and the member requirement — half of five, rounded up — is collected
    // after. The close is an acknowledgement rather than an approval: the Home
    // has no grounds to refuse arithmetic, only to be told about it.
    //
    // Three of five, and the proposer's own approval is one of them: an
    // approver who said yes has plainly also accepted that it is happening.
    expect(requirement.level).toBe("critical");
    expect(requirement.requiredAcks).toBe(3);
    expect(
      requirement.participants.find(
        (participant) => participant.memberId === coLead.memberId,
      ),
    ).toEqual({ memberId: coLead.memberId, capacity: "acknowledger", isMandatory: true });
  });

  it("does not complete on the proposer's own responses", async () => {
    const decisionId = await propose("close_settlement", { period, shadow_mode: false });

    // The proposer's proposal is their approval, and it is not a quorum. This
    // is the property the whole version exists to protect: one member's
    // responses cannot complete a Critical decision.
    await respond(lead, decisionId, "approver");
    expect(await statusOf(decisionId)).toBe("waiting");

    // Two of the three, one of them the mandatory Co-Admin's.
    await respond(coLead, decisionId, "acknowledger");
    expect(await statusOf(decisionId)).toBe("waiting");

    await respond(one, decisionId, "acknowledger");
    expect(await statusOf(decisionId)).toBe("approved");

    // Left approved and unapplied on purpose: the next test applies it.
    await admin.from("decisions").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", decisionId);
  });

  it("refuses to apply a decision that is not approved, service-role key and all", async () => {
    const decisionId = await propose("close_settlement", { period, shadow_mode: false });
    const { input } = await apply_time_numbers();

    const { error } = await admin.rpc("apply_decision", {
      p_decision_id: decisionId,
      p_input: input,
    });

    expect(error?.message ?? "").toContain("NOT_APPROVED");
    await admin.from("decisions").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", decisionId);
  });

  it("refuses to apply an approved decision a mandatory participant never answered", async () => {
    const decisionId = await propose("close_settlement", { period, shadow_mode: false });
    // Everybody except the Co-Admin, who is the mandatory participant here.
    await respond(lead, decisionId, "approver");
    await respond(two, decisionId, "acknowledger");
    await respond(three, decisionId, "acknowledger");

    // Forced with the service-role key, because the resolver would not have
    // written this status: the point is that `apply_decision` re-derives the
    // checks from the rows instead of trusting the status it is handed.
    await admin
      .from("decisions")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", decisionId);

    const { input } = await apply_time_numbers();
    const { error } = await admin.rpc("apply_decision", {
      p_decision_id: decisionId,
      p_input: input,
    });

    expect(error?.message ?? "").toContain("MANDATORY_RESPONSE_MISSING");
    await admin.from("decisions").update({ status: "cancelled" }).eq("id", decisionId);
  });

  it("refuses apply-time numbers whose payments do not match the balances", async () => {
    const decisionId = await propose("close_settlement", { period, shadow_mode: false });
    await respond(lead, decisionId, "approver");
    await respond(coLead, decisionId, "acknowledger");
    await respond(one, decisionId, "acknowledger");
    expect(await statusOf(decisionId)).toBe("approved");

    const { input } = await apply_time_numbers();
    const settlements = input.settlements as { amount_paise: number }[];
    settlements[0] = { ...settlements[0], amount_paise: settlements[0].amount_paise - 1 };

    const { error } = await admin.rpc("apply_decision", {
      p_decision_id: decisionId,
      p_input: input,
    });

    expect(error?.message ?? "").toContain("SETTLEMENT_UNRECONCILED");
    expect(await statusOf(decisionId)).toBe("approved"); // still approved, still unapplied
    await admin.from("decisions").update({ status: "cancelled" }).eq("id", decisionId);
  });

  it("closes the month when the Home has answered, and nets to exactly zero", async () => {
    const decisionId = await propose("close_settlement", { period, shadow_mode: false });
    await respond(lead, decisionId, "approver");
    await respond(coLead, decisionId, "acknowledger");
    await respond(one, decisionId, "acknowledger");
    expect(await statusOf(decisionId)).toBe("approved");

    const { input } = await apply_time_numbers();
    const { error } = await admin.rpc("apply_decision", {
      p_decision_id: decisionId,
      p_input: input,
    });
    expect(error).toBeNull();
    expect(await statusOf(decisionId)).toBe("applied");

    const { data: periodRow } = await admin
      .from("monthly_periods")
      .select("status, closed_by")
      .eq("id", periodId)
      .single();
    expect((periodRow as { status: string }).status).toBe("closing");
    expect((periodRow as { closed_by: string }).closed_by).toBe(lead.memberId);

    const { data: stored } = await admin
      .from("member_period_balances")
      .select("member_id, final_net_paise")
      .eq("period_id", periodId);
    expect(stored).toHaveLength(5);
    expect(
      (stored as { final_net_paise: number }[]).reduce(
        (sum, row) => sum + row.final_net_paise,
        0,
      ),
    ).toBe(0);

    const { data: payments } = await admin
      .from("settlements")
      .select("from_member_id, to_member_id, amount_paise")
      .eq("period_id", periodId);
    expect(payments!.length).toBeLessThanOrEqual(4); // at most n − 1
    for (const payment of payments as { amount_paise: number }[]) {
      expect(payment.amount_paise).toBeGreaterThan(0);
    }
  });

  it("moves money between two members without creating any", async () => {
    const before = await admin
      .from("member_period_balances")
      .select("member_id, final_net_paise")
      .eq("period_id", periodId);
    const netBefore = new Map(
      (before.data as { member_id: string; final_net_paise: number }[]).map((row) => [
        row.member_id,
        row.final_net_paise,
      ]),
    );

    const decisionId = await propose("balance_adjustment", {
      from_member_id: one.memberId,
      to_member_id: two.memberId,
      amount_paise: 25000,
      reason: "One paid Two in cash and it never reached the app",
    });

    // Only the two whose money moves are asked, and both of them, so every
    // participant answers.
    const requirement = requirementFor("balance_adjustment");
    for (const participant of requirement.participants) {
      const actor = [coLead, one, two, three].find(
        (candidate) => candidate.memberId === participant.memberId,
      );
      if (!actor) continue;
      await respond(actor, decisionId, participant.capacity);
    }
    expect(await statusOf(decisionId)).toBe("approved");

    const { error } = await admin.rpc("apply_decision", {
      p_decision_id: decisionId,
      p_input: {},
    });
    expect(error).toBeNull();

    const { data: adjustments } = await admin
      .from("balance_adjustments")
      .select("from_member_id, to_member_id, amount_paise, decision_id")
      .eq("period_id", periodId);
    expect(adjustments).toHaveLength(1);
    expect(adjustments![0]).toMatchObject({
      from_member_id: one.memberId,
      to_member_id: two.memberId,
      amount_paise: 25000,
      decision_id: decisionId,
    });

    const after = await admin
      .from("member_period_balances")
      .select("member_id, final_net_paise")
      .eq("period_id", periodId);
    const rows = after.data as { member_id: string; final_net_paise: number }[];

    expect(rows.reduce((sum, row) => sum + row.final_net_paise, 0)).toBe(0);
    const netOf = (memberId: string) =>
      rows.find((row) => row.member_id === memberId)!.final_net_paise;
    expect(netOf(one.memberId)).toBe(netBefore.get(one.memberId)! - 25000);
    expect(netOf(two.memberId)).toBe(netBefore.get(two.memberId)! + 25000);

    // One delta settlement, in the direction of the money, and positive.
    const { data: deltas } = await admin
      .from("settlements")
      .select("from_member_id, to_member_id, amount_paise, is_delta")
      .eq("period_id", periodId)
      .eq("is_delta", true);
    expect(deltas).toHaveLength(1);
    expect(deltas![0]).toMatchObject({
      from_member_id: one.memberId,
      to_member_id: two.memberId,
      amount_paise: 25000,
    });
  });

  it("keeps adjustments inside the Home that made them", async () => {
    const { data: mine } = await one.client
      .from("balance_adjustments")
      .select("id")
      .eq("house_id", houseId);
    expect(mine!.length).toBeGreaterThan(0);

    const { data: theirs, error } = await outsider.client
      .from("balance_adjustments")
      .select("id")
      .eq("house_id", houseId);

    // RLS answers with no rows rather than an error: the outsider is a
    // legitimate caller asking about a Home that, as far as they can see, has
    // no adjustments.
    expect(error).toBeNull();
    expect(theirs).toEqual([]);
  });

  it("lets nobody but a decision write one", async () => {
    const { error } = await one.client.from("balance_adjustments").insert({
      house_id: houseId,
      period_id: periodId,
      decision_id: null as never,
      from_member_id: three.memberId,
      to_member_id: one.memberId,
      amount_paise: 100000,
      reason: "Because I said so",
    });
    expect(error).not.toBeNull();
  });
});
