import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { selectParticipants } from "@/lib/domain/governance/participants";
import type {
  DecisionType,
  GovernanceMember,
  GovernancePolicy,
  Requirement,
} from "@/lib/domain/governance/types";

config({ path: ".env.local", quiet: true });

/**
 * Phase 11 slice 6, against a real database: expected contributions (EX-13) and
 * the reserve (EX-14).
 *
 * The two properties this suite exists for, both of which only exist once there
 * is a Postgres:
 *
 *   * a funded pot moves nobody's settlement position — it reduces no owed
 *     figure and enters no split, until the Home draws on it (BR-286, E-86);
 *   * a draw pays a named approved expense, and that expense then charges
 *     nobody at all (BR-285).
 *
 * The arithmetic behind both is proved without a database in
 * `tests/unit/position.test.ts`. It creates and deletes real users. Point it at
 * a scratch project.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);
const describeIfConfigured = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

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

describeIfConfigured("expected contributions and the reserve", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  let lead: Actor;
  let coLead: Actor;
  let one: Actor;
  let outsider: Actor;

  let houseId: string;
  let periodId: string;
  let reserveId: string;
  let categoryId: string;
  const period = lastMonth();
  const houseIds: string[] = [];
  const userIds: string[] = [];

  let policy: GovernancePolicy;
  let members: GovernanceMember[];
  const byMember = new Map<string, Actor>();

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `reserve-${label}-${stamp}@houseos.test`;
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
      const { error: roleError } = await lead.client
        .from("house_members")
        .update({ role })
        .eq("id", memberId);
      if (roleError) throw roleError;
    }
    return memberId;
  }

  function requirementFor(type: DecisionType): Requirement {
    const selection = selectParticipants({
      proposal: { type, proposerId: lead.memberId },
      members,
      policy,
      autoConfirmHours: 48,
    });
    if ("refusal" in selection) throw new Error(selection.refusal);
    return selection.requirement;
  }

  /** Propose, then have every participant answer, so the decision approves. */
  async function decide(
    type: DecisionType,
    payload: Record<string, unknown>,
    subjectId: string | null = null,
  ): Promise<{ decisionId: string; applyError: string | null }> {
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
      p_subject_type: subjectId ? "period" : null,
      p_subject_id: subjectId,
      p_subject_member_id: null,
      p_payload: payload,
      p_reason: "A reason of adequate length for the record",
      p_deadline: null,
      p_supersedes_id: null,
    });
    if (error) throw error;
    const decisionId = ((Array.isArray(data) ? data : [data])[0] as { id: string }).id;

    for (const participant of requirement.participants) {
      const actor = byMember.get(participant.memberId);
      if (!actor) continue;

      // Stop once it has resolved. An approver's yes counts as an
      // acknowledgement too, so a Home of three can meet the requirement
      // before everybody asked has answered — and the insert policy refuses a
      // response to a decision that is no longer waiting.
      const { data: current } = await admin
        .from("decisions")
        .select("status")
        .eq("id", decisionId)
        .single();
      if ((current as { status: string }).status !== "waiting") break;

      const { error: responseError } = await actor.client
        .from("decision_responses")
        .insert({
          decision_id: decisionId,
          member_id: participant.memberId,
          capacity: participant.capacity,
          response: participant.capacity === "approver" ? "approve" : "acknowledge",
        });
      if (responseError) throw responseError;
    }

    const { error: applyError } = await admin.rpc("apply_decision", {
      p_decision_id: decisionId,
      p_input: {},
    });

    return { decisionId, applyError: applyError?.message ?? null };
  }

  /** Every member's paid and fair share, straight out of the tables. */
  async function positionFromDatabase(): Promise<Map<string, number>> {
    const { data: expenses } = await admin
      .from("expenses")
      .select("amount_paise, paid_by_member_id, reserve_id")
      .eq("period_id", periodId)
      .eq("status", "approved");

    const { data: splits } = await admin
      .from("expense_splits")
      .select("member_id, share_paise, guest_share_paise, dependent_share_paise")
      .eq("house_id", houseId);

    const variance = new Map<string, number>();
    for (const member of members) variance.set(member.id, 0);

    for (const row of (expenses ?? []) as {
      amount_paise: number;
      paid_by_member_id: string;
      reserve_id: string | null;
    }[]) {
      // BR-285: a cost the pot paid enters nobody's position.
      if (row.reserve_id) continue;
      variance.set(
        row.paid_by_member_id,
        (variance.get(row.paid_by_member_id) ?? 0) + row.amount_paise,
      );
    }

    for (const row of (splits ?? []) as {
      member_id: string;
      share_paise: number;
      guest_share_paise: number;
      dependent_share_paise: number;
    }[]) {
      variance.set(
        row.member_id,
        (variance.get(row.member_id) ?? 0) -
          row.share_paise -
          row.guest_share_paise -
          row.dependent_share_paise,
      );
    }

    return variance;
  }

  async function addExpense(amountPaise: number): Promise<string> {
    const { data: expense, error } = await admin
      .from("expenses")
      .insert({
        house_id: houseId,
        period_id: periodId,
        paid_by_member_id: lead.memberId,
        category_id: categoryId,
        amount_paise: amountPaise,
        description: "A shared cost",
        expense_date: `${period}-05`,
        status: "approved",
        created_by: lead.memberId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const id = (expense as { id: string }).id;
    const base = Math.floor(amountPaise / members.length);
    const remainder = amountPaise - base * members.length;
    const { error: splitError } = await admin.from("expense_splits").insert(
      members.map((member, position) => ({
        house_id: houseId,
        expense_id: id,
        member_id: member.id,
        share_paise: base + (position < remainder ? 1 : 0),
        guest_share_paise: 0,
      })),
    );
    if (splitError) throw splitError;
    return id;
  }

  beforeAll(async () => {
    const leadUser = await signUp("lead");
    houseId = await makeHome(leadUser, `Reserve Home ${stamp}`);
    lead = { ...leadUser, memberId: await memberIdOf(houseId, leadUser.userId) };

    const coLeadUser = await signUp("colead");
    coLead = { ...coLeadUser, memberId: await join(coLeadUser, "co_admin") };
    const oneUser = await signUp("one");
    one = { ...oneUser, memberId: await join(oneUser, "member") };

    const outsiderUser = await signUp("outsider");
    await makeHome(outsiderUser, `Elsewhere ${stamp}`);
    outsider = { ...outsiderUser, memberId: "" };

    for (const actor of [lead, coLead, one]) byMember.set(actor.memberId, actor);

    await admin
      .from("house_members")
      .update({ joined_date: `${period}-01` })
      .eq("house_id", houseId);

    const { data: policyRow } = await admin
      .from("governance_policy")
      .select("*")
      .eq("house_id", houseId)
      .single();
    const row = policyRow as {
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
      .eq("house_id", houseId)
      .order("id");
    members = (
      memberRows as { id: string; role: string; status: string; member_kind: string }[]
    ).map((member) => ({
      id: member.id,
      role: member.role as GovernanceMember["role"],
      status: member.status as GovernanceMember["status"],
      kind: member.member_kind as GovernanceMember["kind"],
    }));
    expect(members).toHaveLength(3);

    const { data: periodRow } = await admin
      .from("monthly_periods")
      .insert({ house_id: houseId, period })
      .select("id")
      .single();
    periodId = (periodRow as { id: string }).id;

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();
    categoryId = (category as { id: string }).id;

    await addExpense(300000);
  }, 180_000);

  afterAll(async () => {
    if (!configured) return;
    for (const house of houseIds) {
      await admin.from("reserve_movements").delete().eq("house_id", house);
      await admin.from("expenses").delete().eq("house_id", house);
      await admin.from("reserves").delete().eq("house_id", house);
      await admin.from("member_expected_contributions").delete().eq("house_id", house);
      await admin.from("houses").delete().eq("id", house);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 180_000);

  it("sets an expected contribution only by decision, and charges nobody", async () => {
    const before = await positionFromDatabase();

    const { decisionId, applyError } = await decide("set_expected_contribution", {
      member_id: one.memberId,
      amount_paise: 1500000,
      effective_from: `${period}-01`,
    });
    expect(applyError).toBeNull();

    const { data: rows } = await admin
      .from("member_expected_contributions")
      .select("member_id, amount_paise, effective_from, effective_to, decision_id")
      .eq("house_id", houseId);

    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      member_id: one.memberId,
      amount_paise: 1500000,
      effective_to: null,
      decision_id: decisionId,
    });

    // BR-280: display-only. Not a paisa of anybody's position moved.
    expect(await positionFromDatabase()).toEqual(before);
  });

  it("refuses an expected contribution written directly (BR-281)", async () => {
    const { error } = await lead.client.from("member_expected_contributions").insert({
      house_id: houseId,
      member_id: coLead.memberId,
      amount_paise: 500000,
      effective_from: `${period}-01`,
      decision_id: null as never,
    });
    expect(error).not.toBeNull();
  });

  it("closes the standing expectation rather than overwriting it", async () => {
    const { applyError } = await decide("set_expected_contribution", {
      member_id: one.memberId,
      amount_paise: 1800000,
      effective_from: `${period}-15`,
    });
    expect(applyError).toBeNull();

    const { data: rows } = await admin
      .from("member_expected_contributions")
      .select("amount_paise, effective_from, effective_to")
      .eq("member_id", one.memberId)
      .order("effective_from");

    // What the Home expected in the first half of the month is still there.
    expect(rows).toHaveLength(2);
    expect(rows![0]).toMatchObject({ amount_paise: 1500000, effective_to: `${period}-15` });
    expect(rows![1]).toMatchObject({ amount_paise: 1800000, effective_to: null });
  });

  it("creates a named pot by decision, empty (BR-287)", async () => {
    const { decisionId, applyError } = await decide("create_reserve", {
      name: "Repairs",
    });
    expect(applyError).toBeNull();

    const { data: reserve } = await admin
      .from("reserves")
      .select("id, name, balance_paise, decision_id, active")
      .eq("house_id", houseId)
      .single();

    expect(reserve).toMatchObject({
      name: "Repairs",
      balance_paise: 0,
      decision_id: decisionId,
      active: true,
    });
    reserveId = (reserve as { id: string }).id;
  });

  it("takes a member's contribution and moves nobody's position (BR-286)", async () => {
    const before = await positionFromDatabase();

    const { error } = await one.client.from("reserve_movements").insert({
      house_id: houseId,
      reserve_id: reserveId,
      kind: "contribution",
      amount_paise: 400000,
      member_id: one.memberId,
      period_id: periodId,
      note: "Into the repairs pot",
    });
    expect(error).toBeNull();

    const { data: reserve } = await admin
      .from("reserves")
      .select("balance_paise")
      .eq("id", reserveId)
      .single();
    expect((reserve as { balance_paise: number }).balance_paise).toBe(400000);

    // E-86: the pot holds ₹4,000 and nobody's owed figure has moved by a paisa.
    expect(await positionFromDatabase()).toEqual(before);
  });

  it("refuses a contribution recorded in somebody else's name", async () => {
    const { error } = await one.client.from("reserve_movements").insert({
      house_id: houseId,
      reserve_id: reserveId,
      kind: "contribution",
      amount_paise: 100000,
      member_id: coLead.memberId,
    });
    expect(error).not.toBeNull();
  });

  it("refuses a draw written by hand, however well-formed", async () => {
    const expenseId = await addExpense(100000);
    const { error } = await one.client.from("reserve_movements").insert({
      house_id: houseId,
      reserve_id: reserveId,
      kind: "draw",
      amount_paise: 100000,
      expense_id: expenseId,
      decision_id: null as never,
    });
    // BR-287: a draw with no decision is refused by the check constraint, and
    // the insert policy admits contributions only.
    expect(error).not.toBeNull();
    await admin.from("expense_splits").delete().eq("expense_id", expenseId);
    await admin.from("expenses").delete().eq("id", expenseId);
  });

  it("refuses a draw for more than the pot holds (BR-283)", async () => {
    const expenseId = await addExpense(900000);

    const { applyError } = await decide("reserve_draw", {
      reserve_id: reserveId,
      expense_id: expenseId,
      note: "More than we have",
    });

    // The trigger, under `for update`. The proposal-time refusal is the same
    // question asked earlier and is unit-tested in tests/unit/position.test.ts.
    expect(applyError ?? "").toContain("INSUFFICIENT_RESERVE");

    const { data: reserve } = await admin
      .from("reserves")
      .select("balance_paise")
      .eq("id", reserveId)
      .single();
    expect((reserve as { balance_paise: number }).balance_paise).toBe(400000);

    await admin.from("expense_splits").delete().eq("expense_id", expenseId);
    await admin.from("expenses").delete().eq("id", expenseId);
  });

  it("pays an expense from the pot, and that expense then charges nobody", async () => {
    const before = await positionFromDatabase();
    const expenseId = await addExpense(250000);

    // Charged normally to begin with: everybody's share of ₹2,500.
    const charged = await positionFromDatabase();
    for (const member of members) {
      expect(charged.get(member.id)).not.toBe(before.get(member.id));
    }

    const { applyError } = await decide("reserve_draw", {
      reserve_id: reserveId,
      expense_id: expenseId,
      note: "The pot pays for the plumber",
    });
    expect(applyError).toBeNull();

    const { data: expense } = await admin
      .from("expenses")
      .select("reserve_id")
      .eq("id", expenseId)
      .single();
    expect((expense as { reserve_id: string }).reserve_id).toBe(reserveId);

    const { data: splits } = await admin
      .from("expense_splits")
      .select("id")
      .eq("expense_id", expenseId);
    expect(splits).toEqual([]);

    const { data: reserve } = await admin
      .from("reserves")
      .select("balance_paise")
      .eq("id", reserveId)
      .single();
    expect((reserve as { balance_paise: number }).balance_paise).toBe(150000);

    // BR-285 — back exactly where the Home was before the expense existed.
    expect(await positionFromDatabase()).toEqual(before);
  });

  it("refuses a second draw against the same expense", async () => {
    const { data: drawn } = await admin
      .from("expenses")
      .select("id")
      .eq("house_id", houseId)
      .not("reserve_id", "is", null)
      .limit(1)
      .single();

    const { applyError } = await decide("reserve_draw", {
      reserve_id: reserveId,
      expense_id: (drawn as { id: string }).id,
    });
    expect(applyError ?? "").toContain("EXPENSE_ALREADY_DRAWN");
  });

  it("keeps the pot, its movements and the expectations inside the Home", async () => {
    for (const table of [
      "reserves",
      "reserve_movements",
      "member_expected_contributions",
    ] as const) {
      const { data: mine } = await one.client.from(table).select("id").eq("house_id", houseId);
      expect(mine!.length, table).toBeGreaterThan(0);

      const { data: theirs, error } = await outsider.client
        .from(table)
        .select("id")
        .eq("house_id", houseId);
      expect(error, table).toBeNull();
      expect(theirs, table).toEqual([]);
    }
  });
});
