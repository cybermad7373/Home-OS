import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 11 — the Decision record, in a real Postgres.
 *
 * `tests/unit/governance.test.ts` and its property test already cover the
 * engine over plain values. This suite covers the half that only a database
 * can be asked about: the RLS policies, the check constraints, the
 * self-exclusion trigger, and `resolve_decision` — the SQL restatement of the
 * resolver that has to be right even when the caller holds the service-role
 * key and skipped every policy on the way in (D-06).
 *
 * Every decision here is written with the service-role client on purpose.
 * There is no `propose_decision` yet, and more importantly: an acceptance
 * criterion that says "refused when called with the service-role key" cannot
 * be tested by a client that has no service-role key.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/governance
 */

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceKey, configured: Boolean(url && anonKey && serviceKey) };
}

const { url, anonKey, serviceKey, configured } = getConfig();

const admin = configured
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : (null as never);

/**
 * Migration 051 may not be applied to whatever this run is pointed at. That is
 * a state of the environment, not a defect, so the suite skips rather than
 * reporting a failure it cannot tell apart from a missing `db push` — the same
 * shape `membership.test.ts` uses for 047-050.
 */
let migrated = false;
if (configured) {
  try {
    const { error } = await admin
      .from("decisions")
      .select("id")
      .limit(1);
    migrated = !error;
  } catch (e) {
    console.log("Migration check failed:", e);
    migrated = false;
  }
}

console.log("GOVERNANCE TEST: configured =", configured, "migrated =", migrated);

const describeIfReady = configured && migrated ? describe : describe.skip;

/**
 * 053 may be applied a `db push` later than 051 and 052, so the apply tests
 * gate separately rather than taking the other 29 down with them. A missing
 * function is a PostgREST schema-cache miss; a present one refuses a uuid that
 * names no decision, which is the answer being looked for here.
 */
async function applyIsMigrated(): Promise<boolean> {
  if (!configured || !migrated) return false;
  try {
    const { error } = await admin.rpc("apply_decision", {
      p_decision_id: "00000000-0000-0000-0000-000000000000",
    });
    return !(error?.message ?? "").includes("Could not find the function");
  } catch {
    // apply_decision requires member_write_authorised; treat as not migrated.
    return false;
  }
}

const applyMigrated = await applyIsMigrated();

const describeIfApply = configured && applyMigrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface Actor {
  userId: string;
  email: string;
  memberId: string;
  client: SupabaseClient;
}

describeIfReady("governance — the Decision record", () => {
  /** Four people: an Admin, a Co-Admin, and two ordinary members. */
  let lead: Actor;
  let coLead: Actor;
  let one: Actor;
  let two: Actor;
  let outsider: Actor;

  let houseId: string;
  let otherHouseId: string;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `gov-${label}-${stamp}@houseos.test`;
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

  /** Join through the real flow, then set the role directly. */
  async function join(
    actor: Omit<Actor, "memberId">,
    house: string,
    role: "co_admin" | "member",
  ): Promise<string> {
    const { data: invite, error: inviteError } = await admin
      .from("invitations")
      .select("token")
      .eq("house_id", house)
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
      .eq("house_id", house)
      .eq("user_id", actor.userId)
      .eq("status", "requested")
      .single();

    const { error: acceptError } = await lead.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });
    if (acceptError) throw acceptError;

    const memberId = await memberIdOf(house, actor.userId);
    // Use lead's client (an admin) to update role. The trigger checks
    // is_house_admin(old.house_id) which passes for lead. Service role
    // would fail because auth.uid() is null for it.
    const { error: roleError } = await lead.client
      .from("house_members")
      .update({ role })
      .eq("id", memberId);
    if (roleError) throw roleError;
    return memberId;
  }

  interface DecisionSeed {
    type?: string;
    level?: "normal" | "important" | "critical";
    requiredApprovals?: number;
    requiredAcks?: number;
    subjectMemberId?: string | null;
    subjectId?: string | null;
    subjectType?: string | null;
    payload?: Record<string, unknown>;
    deadline?: string | null;
    house?: string;
    participants: {
      memberId: string;
      capacity: "approver" | "acknowledger";
      isMandatory?: boolean;
    }[];
  }

  /** A decision written via create_decision RPC (proper path). */
  async function seedDecision(seed: DecisionSeed): Promise<string> {
    const level = seed.level ?? "critical";
    const participantsJson = seed.participants.map((p) => ({
      member_id: p.memberId,
      capacity: p.capacity,
      is_mandatory: p.isMandatory ?? false,
    }));
    // Must use an authenticated member's client (lead), not service role
    const { data, error } = await lead.client.rpc("create_decision", {
      p_house_id: seed.house ?? houseId,
      p_type: seed.type ?? "remove_member",
      p_level: level,
      p_participants: participantsJson,
      p_required_approvals: seed.requiredApprovals ?? 0,
      p_required_acks: seed.requiredAcks ?? 0,
      p_subject_member_id: seed.subjectMemberId ?? null,
      p_subject_id: seed.subjectId ?? null,
      p_subject_type: seed.subjectType ?? null,
      p_payload: seed.payload ?? {},
      p_reason: level === "critical" ? "A reason of adequate length" : null,
      p_deadline: seed.deadline === undefined ? null : seed.deadline,
      p_supersedes_id: null,
    });
    if (error) throw error;
    // create_decision returns setof decisions with the created row
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) throw new Error("create_decision returned no rows");
    return (rows[0] as { id: string }).id;
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

  beforeAll(async () => {
    console.log("beforeAll: starting setup");
    const leadUser = await signUp("lead");
    console.log("beforeAll: leadUser created");
    houseId = await makeHome(leadUser, `Gov Home ${stamp}`);
    console.log("beforeAll: house created", houseId);
    lead = { ...leadUser, memberId: await memberIdOf(houseId, leadUser.userId) };
    console.log("beforeAll: lead memberId", lead.memberId);

    const coLeadUser = await signUp("colead");
    console.log("beforeAll: coLeadUser created");
    coLead = { ...coLeadUser, memberId: await join(coLeadUser, houseId, "co_admin") };
    console.log("beforeAll: coLead joined");

    const oneUser = await signUp("one");
    one = { ...oneUser, memberId: await join(oneUser, houseId, "member") };
    console.log("beforeAll: one joined");

    const twoUser = await signUp("two");
    two = { ...twoUser, memberId: await join(twoUser, houseId, "member") };
    console.log("beforeAll: two joined");

    const outsiderUser = await signUp("outsider");
    otherHouseId = await makeHome(outsiderUser, `Other Home ${stamp}`);
    outsider = {
      ...outsiderUser,
      memberId: await memberIdOf(otherHouseId, outsiderUser.userId),
    };
    console.log("beforeAll: setup complete");
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // Every Home has a policy
  // -------------------------------------------------------------------------
  it("seeds a governance policy with the documented defaults", async () => {
    const { data, error } = await admin
      .from("governance_policy")
      .select("*")
      .eq("house_id", houseId)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      critical_requires_coadmin: true,
      critical_member_rule: "proportion",
      critical_member_value: 50,
      governance_requires_all: true,
      expense_approvals_required: 1,
      decision_deadline_days: 7,
      absence_deadline_hours: 48,
    });
  });

  it("refuses to let a member rewrite the rules they live under", async () => {
    const { error } = await lead.client
      .from("governance_policy")
      .update({ critical_member_value: 1 })
      .eq("house_id", houseId);

    // No write policy exists, so the update matches zero rows rather than
    // raising. The row is what the assertion is actually about.
    expect(error).toBeNull();
    const { data } = await admin
      .from("governance_policy")
      .select("critical_member_value")
      .eq("house_id", houseId)
      .single();
    expect((data as { critical_member_value: number }).critical_member_value).toBe(50);
  });

  // -------------------------------------------------------------------------
  // The property the version exists to protect
  // -------------------------------------------------------------------------
  it("does not let one member's own responses approve a Critical decision", async () => {
    // The trap in miniature: the same person listed twice, once in each
    // capacity, against a requirement of one approval and one acknowledgement.
    // A resolver counting rows approves this. One counting responders does not.
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 1,
      requiredAcks: 1,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: one.memberId, capacity: "acknowledger" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    await admin.from("decision_responses").insert([
      { decision_id: decisionId, member_id: one.memberId, capacity: "approver", response: "approve" },
      { decision_id: decisionId, member_id: one.memberId, capacity: "acknowledger", response: "acknowledge" },
    ]);

    expect(await statusOf(decisionId)).toBe("waiting");

    // A second person moves it, and only a second person.
    await admin.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: two.memberId,
      capacity: "approver",
      response: "approve",
    });
    expect(await statusOf(decisionId)).toBe("approved");
  }, 30_000);

  it("holds a Critical decision that has met its counts but not its mandatory participant", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 1,
      participants: [
        { memberId: coLead.memberId, capacity: "approver", isMandatory: true },
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    await admin.from("decision_responses").insert([
      { decision_id: decisionId, member_id: one.memberId, capacity: "approver", response: "approve" },
      { decision_id: decisionId, member_id: two.memberId, capacity: "approver", response: "approve" },
    ]);
    expect(await statusOf(decisionId)).toBe("waiting");

    await admin.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: coLead.memberId,
      capacity: "approver",
      response: "approve",
    });
    expect(await statusOf(decisionId)).toBe("approved");
  }, 30_000);

  // -------------------------------------------------------------------------
  // Who may respond, and to what
  // -------------------------------------------------------------------------
  it("refuses a response from somebody who is not a participant", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { error } = await coLead.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: coLead.memberId,
      capacity: "approver",
      response: "approve",
    });
    expect(error).not.toBeNull();
    expect(await statusOf(decisionId)).toBe("waiting");
  }, 30_000);

  it("refuses a response written on another member's behalf", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    // `one` is a participant, and so is `two`. That is not the same as `one`
    // being allowed to answer as `two`.
    const { error } = await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: two.memberId,
      capacity: "approver",
      response: "approve",
    });
    expect(error).not.toBeNull();
  }, 30_000);

  it("refuses to let a response be revised or withdrawn", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { error: insertError } = await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      response: "approve",
    });
    expect(insertError).toBeNull();

    // No update policy and no delete policy: both match zero rows.
    await one.client
      .from("decision_responses")
      .update({ response: "reject", reason: "changed my mind entirely" })
      .eq("decision_id", decisionId)
      .eq("member_id", one.memberId);
    await one.client
      .from("decision_responses")
      .delete()
      .eq("decision_id", decisionId)
      .eq("member_id", one.memberId);

    const { data } = await admin
      .from("decision_responses")
      .select("response")
      .eq("decision_id", decisionId)
      .eq("member_id", one.memberId);
    expect(data).toEqual([{ response: "approve" }]);

    // And a second attempt in the same capacity is refused outright.
    const { error: duplicateError } = await one.client
      .from("decision_responses")
      .insert({
        decision_id: decisionId,
        member_id: one.memberId,
        capacity: "approver",
        response: "approve",
      });
    expect(duplicateError).not.toBeNull();
  }, 30_000);

  it("refuses a response to a decision that has already resolved", async () => {
    const decisionId = await seedDecision({
      level: "normal",
      requiredApprovals: 1,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      response: "approve",
    });
    expect(await statusOf(decisionId)).toBe("approved");

    const { error } = await two.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: two.memberId,
      capacity: "approver",
      response: "approve",
    });
    expect(error).not.toBeNull();
  }, 30_000);

  // -------------------------------------------------------------------------
  // Self-exclusion, enforced against the service-role key
  // -------------------------------------------------------------------------
  it("refuses to make the subject of a decision a participant in it", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 1,
      subjectMemberId: two.memberId,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: coLead.memberId, capacity: "approver" },
      ],
    });

    const { error } = await admin.from("decision_participants").insert({
      decision_id: decisionId,
      member_id: two.memberId,
      capacity: "approver",
    });
    expect(error?.message ?? "").toContain("SUBJECT_IS_PARTICIPANT");
  }, 30_000);

  it("refuses to make a participant the subject after the fact", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 1,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: coLead.memberId, capacity: "approver" },
      ],
    });

    const { error } = await admin
      .from("decisions")
      .update({ subject_member_id: one.memberId })
      .eq("id", decisionId);
    expect(error?.message ?? "").toContain("SUBJECT_IS_PARTICIPANT");
  }, 30_000);

  // -------------------------------------------------------------------------
  // Rejection
  // -------------------------------------------------------------------------
  it("refuses a nine-character rejection and resolves on a ten-character one", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { error: shortError } = await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      response: "reject",
      reason: "too soon.",
    });
    expect(shortError).not.toBeNull();
    expect(await statusOf(decisionId)).toBe("waiting");

    const { error: okError } = await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      response: "reject",
      reason: "too soon!!",
    });
    expect(okError).toBeNull();
    expect(await statusOf(decisionId)).toBe("rejected");
  }, 30_000);

  it("refuses a rejection from an acknowledger", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredAcks: 2,
      participants: [
        { memberId: one.memberId, capacity: "acknowledger" },
        { memberId: two.memberId, capacity: "acknowledger" },
      ],
    });

    const { error } = await admin.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "acknowledger",
      response: "reject",
      reason: "I do not agree with this",
    });
    expect(error).not.toBeNull();
  }, 30_000);

  it("counts an approval as an acknowledgement, and not the reverse", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredAcks: 2,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "acknowledger" },
      ],
    });

    await admin.from("decision_responses").insert([
      { decision_id: decisionId, member_id: one.memberId, capacity: "approver", response: "approve" },
      { decision_id: decisionId, member_id: two.memberId, capacity: "acknowledger", response: "acknowledge" },
    ]);
    expect(await statusOf(decisionId)).toBe("approved");
  }, 30_000);

  // -------------------------------------------------------------------------
  // Deadlines
  // -------------------------------------------------------------------------
  it("lapses a decision past its deadline, and keeps it readable", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      deadline: new Date(Date.now() - 60_000).toISOString(),
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { data, error } = await admin.rpc("resolve_decision", {
      p_decision_id: decisionId,
    });
    expect(error).toBeNull();
    expect(data).toBe("lapsed");

    const { data: row } = await lead.client
      .from("decisions")
      .select("status, resolved_at")
      .eq("id", decisionId)
      .single();
    expect(row).toMatchObject({ status: "lapsed" });
    expect((row as { resolved_at: string | null }).resolved_at).not.toBeNull();
  }, 30_000);

  it("does not let a client call the resolver directly", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { error } = await lead.client.rpc("resolve_decision", {
      p_decision_id: decisionId,
    });
    expect(error).not.toBeNull();
  }, 30_000);

  // -------------------------------------------------------------------------
  // The state machine, as constraints
  // -------------------------------------------------------------------------
  it("refuses a Critical decision with no reason", async () => {
    const { error } = await admin.from("decisions").insert({
      house_id: houseId,
      type: "remove_member",
      level: "critical",
      requested_by: lead.memberId,
      reason: "   ",
    });
    expect(error).not.toBeNull();
  });

  it("refuses a result on a decision that has not been applied", async () => {
    const decisionId = await seedDecision({
      level: "normal",
      requiredApprovals: 1,
      participants: [{ memberId: one.memberId, capacity: "approver" }],
    });

    const { error } = await admin
      .from("decisions")
      .update({ result: { moved: 100 } })
      .eq("id", decisionId);
    expect(error).not.toBeNull();
  }, 30_000);

  it("refuses two live decisions about the same subject", async () => {
    const subjectId = crypto.randomUUID();
    await seedDecision({
      type: "close_settlement",
      level: "critical",
      requiredAcks: 1,
      subjectId,
      participants: [
        { memberId: one.memberId, capacity: "acknowledger" },
        { memberId: coLead.memberId, capacity: "acknowledger" },
      ],
    });

    await expect(
      seedDecision({
        type: "close_settlement",
        level: "critical",
        requiredAcks: 1,
        subjectId,
        participants: [
          { memberId: two.memberId, capacity: "acknowledger" },
          { memberId: coLead.memberId, capacity: "acknowledger" },
        ],
      }),
    ).rejects.toThrow();
  }, 30_000);

  // -------------------------------------------------------------------------
  // Proposing, withdrawing, lapsing
  // -------------------------------------------------------------------------
  /** `create_decision`, with the sensible defaults for a Critical proposal. */
  async function propose(
    actor: Actor,
    overrides: Record<string, unknown> = {},
  ) {
    return actor.client.rpc("create_decision", {
      p_house_id: houseId,
      p_type: "remove_member",
      p_level: "critical",
      p_participants: [
        { member_id: coLead.memberId, capacity: "approver", is_mandatory: true },
        { member_id: one.memberId, capacity: "approver" },
      ],
      p_required_approvals: 2,
      p_reason: "Has not lived here since June",
      ...overrides,
    });
  }

  it("writes a decision and its participants in one statement", async () => {
    const { data, error } = await propose(lead, {
      p_subject_member_id: two.memberId,
      p_subject_type: "house_member",
    });
    expect(error).toBeNull();

    const decision = data as { id: string; status: string; requested_by: string };
    expect(decision.status).toBe("waiting");
    expect(decision.requested_by).toBe(lead.memberId);

    const { data: participants } = await admin
      .from("decision_participants")
      .select("member_id, is_mandatory")
      .eq("decision_id", decision.id)
      .order("is_mandatory", { ascending: false });
    expect(participants).toHaveLength(2);
    expect((participants as { is_mandatory: boolean }[])[0].is_mandatory).toBe(true);
  }, 30_000);

  it("refuses a Critical proposal only one person could answer", async () => {
    const { error } = await propose(lead, {
      p_participants: [{ member_id: one.memberId, capacity: "approver" }],
      p_required_approvals: 1,
    });
    expect(error?.message ?? "").toContain("NOT_ENOUGH_PARTICIPANTS");
  }, 30_000);

  it("refuses a Critical proposal listing one person in two capacities", async () => {
    // Two rows, one voice. The count that matters is of people.
    const { error } = await propose(lead, {
      p_participants: [
        { member_id: one.memberId, capacity: "approver" },
        { member_id: one.memberId, capacity: "acknowledger" },
      ],
      p_required_approvals: 1,
      p_required_acks: 1,
    });
    expect(error?.message ?? "").toContain("NOT_ENOUGH_PARTICIPANTS");
  }, 30_000);

  it("refuses a participant who belongs to another Home", async () => {
    const { error } = await propose(lead, {
      p_participants: [
        { member_id: one.memberId, capacity: "approver" },
        { member_id: outsider.memberId, capacity: "approver" },
      ],
    });
    expect(error?.message ?? "").toContain("PARTICIPANT_NOT_ACTIVE_MEMBER");
  }, 30_000);

  it("refuses to ask the subject of a decision about themselves", async () => {
    const { error } = await propose(lead, {
      p_subject_member_id: one.memberId,
    });
    expect(error?.message ?? "").toContain("SUBJECT_IS_PARTICIPANT");
  }, 30_000);

  it("refuses a proposal from somebody who is not in the Home", async () => {
    const { error } = await propose(outsider);
    expect(error?.message ?? "").toContain("NOT_A_MEMBER");
  }, 30_000);

  it("approves on the spot in a Home with nobody to ask", async () => {
    // The documented exception (spec 3.3): the outsider lives alone.
    const { data, error } = await outsider.client.rpc("create_decision", {
      p_house_id: otherHouseId,
      p_type: "change_governance",
      p_level: "critical",
      p_participants: [],
      p_reason: "Nobody else lives here yet",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "approved", auto_approved: true });
  }, 30_000);

  it("lets the proposer withdraw, and nobody else", async () => {
    const { data } = await propose(lead, { p_subject_member_id: two.memberId });
    const decisionId = (data as { id: string }).id;

    const { error: wrongPerson } = await coLead.client.rpc("cancel_decision", {
      p_decision_id: decisionId,
    });
    expect(wrongPerson?.message ?? "").toContain("PROPOSER_REQUIRED");

    const { error: proposerError } = await lead.client.rpc("cancel_decision", {
      p_decision_id: decisionId,
    });
    expect(proposerError).toBeNull();
    expect(await statusOf(decisionId)).toBe("cancelled");

    // And a withdrawn decision cannot be withdrawn twice.
    const { error: twiceError } = await lead.client.rpc("cancel_decision", {
      p_decision_id: decisionId,
    });
    expect(twiceError?.message ?? "").toContain("ALREADY_RESOLVED");
  }, 30_000);

  it("lapses the overdue and leaves the rest waiting, with nobody logged in", async () => {
    const overdue = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      deadline: new Date(Date.now() - 3_600_000).toISOString(),
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });
    const live = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      deadline: new Date(Date.now() + 3_600_000).toISOString(),
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { data, error } = await admin.rpc("expire_decisions");
    expect(error).toBeNull();
    expect(data as number).toBeGreaterThanOrEqual(1);

    expect(await statusOf(overdue)).toBe("lapsed");
    expect(await statusOf(live)).toBe("waiting");
  }, 30_000);

  it("re-proposes a lapsed decision and refuses to re-propose an answered one", async () => {
    const lapsed = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      deadline: new Date(Date.now() - 3_600_000).toISOString(),
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });
    await admin.rpc("resolve_decision", { p_decision_id: lapsed });

    const { data, error } = await propose(lead, { p_supersedes_id: lapsed });
    expect(error).toBeNull();
    expect((data as { supersedes_id: string }).supersedes_id).toBe(lapsed);

    // The new one has been answered by nobody, so it is not itself re-proposable.
    const { error: notLapsed } = await propose(lead, {
      p_supersedes_id: (data as { id: string }).id,
    });
    expect(notLapsed?.message ?? "").toContain("SUPERSEDED_NOT_LAPSED");
  }, 30_000);

  // -------------------------------------------------------------------------
  // Isolation
  // -------------------------------------------------------------------------
  it("shows a Home's decisions to nobody outside it", async () => {
    const decisionId = await seedDecision({
      level: "critical",
      requiredApprovals: 2,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    // The outsider has a Home of their own, so "sees nothing" has to be asked
    // about this Home specifically rather than about the tables as a whole.
    for (const table of ["governance_policy", "decisions"]) {
      const { data, error } = await outsider.client
        .from(table)
        .select("house_id")
        .eq("house_id", houseId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }

    for (const table of ["decision_participants", "decision_responses"]) {
      const { data, error } = await outsider.client
        .from(table)
        .select("decision_id")
        .eq("decision_id", decisionId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }

    // And the outsider cannot respond to what they cannot see.
    const { error: responseError } = await outsider.client
      .from("decision_responses")
      .insert({
        decision_id: decisionId,
        member_id: outsider.memberId,
        capacity: "approver",
        response: "approve",
      });
    expect(responseError).not.toBeNull();
  }, 30_000);

  // -------------------------------------------------------------------------
  // Applying — migration 053
  // -------------------------------------------------------------------------
  // `approved` and `applied` are separate states, and every test below is about
  // the gap between them. They call `apply_decision` with the service-role
  // client for the same reason the rest of the suite writes decisions that way:
  // the acceptance criterion says "refuses ... when called with the
  // service-role key", and a client without one cannot be asked to prove it.
  describeIfApply("applying a decision", () => {

    /** Force a status the responses did not produce, to test the apply guards. */
    async function forceApproved(decisionId: string) {
      const { error } = await admin
        .from("decisions")
        .update({ status: "approved", resolved_at: new Date().toISOString() })
        .eq("id", decisionId);
      if (error) throw error;
    }

    async function apply(decisionId: string) {
      return admin.rpc("apply_decision", { p_decision_id: decisionId });
    }

    async function decisionRow(decisionId: string) {
      const { data, error } = await admin
        .from("decisions")
        .select("status, result, applied_at")
        .eq("id", decisionId)
        .single();
      if (error) throw error;
      return data as {
        status: string;
        result: Record<string, unknown> | null;
        applied_at: string | null;
      };
    }

    it("refuses to apply a decision that is still waiting", async () => {
      const decisionId = await seedDecision({
        level: "critical",
        requiredApprovals: 2,
        participants: [
          { memberId: coLead.memberId, capacity: "approver", isMandatory: true },
          { memberId: one.memberId, capacity: "approver" },
        ],
      });

      const { error } = await apply(decisionId);
      expect(error?.message ?? "").toContain("NOT_APPROVED");

      // And nothing was written on the way to being refused.
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("waiting");
      expect(row.applied_at).toBeNull();
      expect(row.result).toBeNull();
    }, 30_000);

    it("refuses an approved decision that is missing its mandatory response", async () => {
      const decisionId = await seedDecision({
        level: "critical",
        requiredApprovals: 1,
        participants: [
          { memberId: coLead.memberId, capacity: "approver", isMandatory: true },
          { memberId: one.memberId, capacity: "approver" },
        ],
      });

      await admin.from("decision_responses").insert({
        decision_id: decisionId,
        member_id: one.memberId,
        capacity: "approver",
        response: "approve",
      });

      // The Co-Admin has not answered. `resolve_decision` knows that and left it
      // waiting; the status is overwritten here precisely so that `apply_decision`
      // has to notice it for itself.
      await forceApproved(decisionId);

      const { error } = await apply(decisionId);
      expect(error?.message ?? "").toContain("MANDATORY_RESPONSE_MISSING");
      expect((await decisionRow(decisionId)).applied_at).toBeNull();
    }, 30_000);

    it("refuses a Critical decision that only one person answered", async () => {
      const decisionId = await seedDecision({
        level: "critical",
        requiredApprovals: 1,
        participants: [
          { memberId: one.memberId, capacity: "approver" },
          { memberId: coLead.memberId, capacity: "approver" },
        ],
      });

      await admin.from("decision_responses").insert({
        decision_id: decisionId,
        member_id: one.memberId,
        capacity: "approver",
        response: "approve",
      });
      await forceApproved(decisionId);

      const { error } = await apply(decisionId);
      expect(error?.message ?? "").toContain("CRITICAL_NEEDS_TWO_RESPONDERS");
    }, 30_000);

    it("refuses to apply a decision carrying a rejection", async () => {
      const decisionId = await seedDecision({
        level: "critical",
        requiredApprovals: 1,
        participants: [
          { memberId: one.memberId, capacity: "approver" },
          { memberId: two.memberId, capacity: "approver" },
        ],
      });

      await admin.from("decision_responses").insert([
        { decision_id: decisionId, member_id: one.memberId, capacity: "approver", response: "approve" },
        {
          decision_id: decisionId,
          member_id: two.memberId,
          capacity: "approver",
          response: "reject",
          reason: "The money has not been settled",
        },
      ]);

      // The resolver has already made this `rejected`. Overwriting the status is
      // the only way to ask whether the apply path would have caught it too.
      await forceApproved(decisionId);

      const { error } = await apply(decisionId);
      expect(error?.message ?? "").toContain("DECISION_REJECTED");
    }, 30_000);

    it("removes a member through a decision, and records what happened", async () => {
      const leaverUser = await signUp("leaver");
      const leaverId = await join(leaverUser, houseId, "member");

      const decisionId = await seedDecision({
        level: "critical",
        requiredApprovals: 2,
        subjectMemberId: leaverId,
        subjectType: "house_member",
        participants: [
          { memberId: coLead.memberId, capacity: "approver", isMandatory: true },
          { memberId: one.memberId, capacity: "approver" },
        ],
      });

      // Through the real path this time: two people, each answering for
      // themselves, under the insert policy.
      for (const actor of [coLead, one]) {
        const { error } = await actor.client.from("decision_responses").insert({
          decision_id: decisionId,
          member_id: actor.memberId,
          capacity: "approver",
          response: "approve",
        });
        expect(error).toBeNull();
      }
      expect(await statusOf(decisionId)).toBe("approved");

      // Approved is not applied: the member is still active until the effect runs.
      const { data: stillActive } = await admin
        .from("house_members")
        .select("status")
        .eq("id", leaverId)
        .single();
      expect((stillActive as { status: string }).status).toBe("active");

      const { error: applyError } = await apply(decisionId);
      expect(applyError).toBeNull();

      const row = await decisionRow(decisionId);
      expect(row.status).toBe("applied");
      expect(row.applied_at).not.toBeNull();
      expect(row.result).toMatchObject({
        member_id: leaverId,
        status: "inactive",
        // They owe nobody and nobody owes them, so the removal finished today.
        pending_settlement: false,
      });

      const { data: removed } = await admin
        .from("house_members")
        .select("status, left_date, removal_decision_id")
        .eq("id", leaverId)
        .single();
      expect(removed).toMatchObject({
        status: "inactive",
        removal_decision_id: decisionId,
      });
      expect((removed as { left_date: string | null }).left_date).not.toBeNull();

      // Applying it again runs no second effect and raises nothing.
      const { error: againError } = await apply(decisionId);
      expect(againError).toBeNull();
      expect((await decisionRow(decisionId)).applied_at).toBe(row.applied_at);
    }, 60_000);

    it("changes the rules the Home lives under, keeping the untouched ones", async () => {
      const decisionId = await seedDecision({
        level: "critical",
        type: "change_governance",
        requiredApprovals: 2,
        payload: { critical_member_value: 75, join_approver_roles: ["admin"] },
        participants: [
          { memberId: coLead.memberId, capacity: "approver", isMandatory: true },
          { memberId: one.memberId, capacity: "approver" },
        ],
      });

      for (const actor of [coLead, one]) {
        await actor.client.from("decision_responses").insert({
          decision_id: decisionId,
          member_id: actor.memberId,
          capacity: "approver",
          response: "approve",
        });
      }
      const { error } = await apply(decisionId);
      expect(error).toBeNull();

      const { data: policy } = await admin
        .from("governance_policy")
        .select("critical_member_value, join_approver_roles, absence_deadline_hours")
        .eq("house_id", houseId)
        .single();
      expect(policy).toMatchObject({
        critical_member_value: 75,
        join_approver_roles: ["admin"],
        // Absent from the payload, so untouched: one threshold was raised, not
        // the whole policy reset.
        absence_deadline_hours: 48,
      });

      const result = (await decisionRow(decisionId)).result as {
        before: { critical_member_value: number };
        after: { critical_member_value: number };
      };
      expect(result.before.critical_member_value).toBe(50);
      expect(result.after.critical_member_value).toBe(75);
    }, 30_000);

    it("accepts a join request through a decision, with nobody's lead check", async () => {
      const joinerUser = await signUp("joiner");
      const { data: invite } = await admin
        .from("invitations")
        .select("token")
        .eq("house_id", houseId)
        .is("revoked_at", null)
        .single();
      await joinerUser.client.rpc("request_join", {
        p_token: (invite as { token: string }).token,
        p_message: null,
      });
      const { data: request } = await admin
        .from("join_requests")
        .select("id")
        .eq("house_id", houseId)
        .eq("user_id", joinerUser.userId)
        .eq("status", "requested")
        .single();
      const requestId = (request as { id: string }).id;

      const decisionId = await seedDecision({
        type: "join_request",
        level: "normal",
        requiredApprovals: 1,
        subjectType: "join_request",
        subjectId: requestId,
        participants: [{ memberId: coLead.memberId, capacity: "approver" }],
      });

      await coLead.client.from("decision_responses").insert({
        decision_id: decisionId,
        member_id: coLead.memberId,
        capacity: "approver",
        response: "approve",
      });
      expect(await statusOf(decisionId)).toBe("approved");

      const { error } = await apply(decisionId);
      expect(error).toBeNull();

      const { data: accepted } = await admin
        .from("join_requests")
        .select("status, decided_by, member_id")
        .eq("id", requestId)
        .single();
      expect(accepted).toMatchObject({
        status: "accepted",
        // No `auth.uid()` was involved, so the record names the proposer.
        decided_by: lead.memberId,
      });
      expect((accepted as { member_id: string | null }).member_id).not.toBeNull();
    }, 60_000);

    it("leaves a decision approved when its effect does not exist yet", async () => {
      // expense_approval is a Phase 2 flow becoming a decision; no effect yet
      const decisionId = await seedDecision({
        type: "expense_approval",
        level: "normal",
        requiredApprovals: 1,
        participants: [{ memberId: coLead.memberId, capacity: "approver" }],
      });

      await coLead.client.from("decision_responses").insert({
        decision_id: decisionId,
        member_id: coLead.memberId,
        capacity: "approver",
        response: "approve",
      });

      const { error } = await apply(decisionId);
      expect(error?.message ?? "").toContain("EFFECT_NOT_IMPLEMENTED");

      // Answered, and visibly not carried out. Not silently marked applied over
      // nothing having happened.
      const row = await decisionRow(decisionId);
      expect(row.status).toBe("approved");
      expect(row.applied_at).toBeNull();
    }, 30_000);

    it("does not let a member apply a decision from the browser", async () => {
      const decisionId = await seedDecision({
        level: "critical",
        requiredApprovals: 2,
        participants: [
          { memberId: coLead.memberId, capacity: "approver", isMandatory: true },
          { memberId: one.memberId, capacity: "approver" },
        ],
      });

      for (const actor of [coLead, one]) {
        await actor.client.from("decision_responses").insert({
          decision_id: decisionId,
          member_id: actor.memberId,
          capacity: "approver",
          response: "approve",
        });
      }

      const { error } = await lead.client.rpc("apply_decision", {
        p_decision_id: decisionId,
      });
      expect(error).not.toBeNull();
      expect((await decisionRow(decisionId)).status).toBe("approved");
    }, 30_000);
  });
});
