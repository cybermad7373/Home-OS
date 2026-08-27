import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 11 — the notifications the governance engine needs, in a real Postgres.
 *
 * `tests/unit/governance-notifications.test.ts` covers the catalogue and the
 * copy over plain values. This suite covers the half only a database can be
 * asked about: the triggers that produce these rows, who each row reaches, the
 * hourly reminder job, and the two rules of section 6 that are enforced in SQL
 * — a mandatory category that cannot be switched off, and a notification
 * addressed to somebody who is not a member of the Home it is about.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/governance-notifications
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

/**
 * Migration 055 may not be applied to whatever this run is pointed at. That is
 * a state of the environment, not a defect, so the suite skips rather than
 * reporting a failure it cannot tell apart from a missing `db push`.
 *
 * The probe asks for the seeded catalogue row rather than for the table: the
 * table has existed since 041, and its emptiness of N-32 is what says whether
 * this migration ran.
 */
const migrated = configured
  ? await admin
      .from("notification_types")
      .select("type")
      .eq("type", "N-32")
      .maybeSingle()
      .then(({ data, error }) => !error && Boolean(data))
  : false;

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface Actor {
  userId: string;
  email: string;
  memberId: string;
  client: SupabaseClient;
}

describeIfReady("governance notifications", () => {
  let lead: Actor;
  let coLead: Actor;
  let one: Actor;
  let two: Actor;
  /** Signed up, never a member of the Home under test. */
  let outsider: Omit<Actor, "memberId">;

  let houseId: string;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `notif-${label}-${stamp}@houseos.test`;
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

  async function inviteToken(house: string): Promise<string> {
    const { data, error } = await admin
      .from("invitations")
      .select("token")
      .eq("house_id", house)
      .is("revoked_at", null)
      .single();
    if (error) throw error;
    return (data as { token: string }).token;
  }

  async function requestJoin(
    actor: Omit<Actor, "memberId">,
    house: string,
    message: string | null = null,
  ): Promise<string> {
    const { error } = await actor.client.rpc("request_join", {
      p_token: await inviteToken(house),
      p_message: message,
    });
    if (error) throw error;

    const { data, error: readError } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", house)
      .eq("user_id", actor.userId)
      .eq("status", "requested")
      .single();
    if (readError) throw readError;
    return (data as { id: string }).id;
  }

  async function join(
    actor: Omit<Actor, "memberId">,
    house: string,
    role: "co_admin" | "member",
  ): Promise<string> {
    const requestId = await requestJoin(actor, house);
    const { error } = await lead.client.rpc("accept_join_request", {
      p_request_id: requestId,
    });
    if (error) throw error;

    const memberId = await memberIdOf(house, actor.userId);
    if (role !== "member") {
      const { error: roleError } = await admin
        .from("house_members")
        .update({ role })
        .eq("id", memberId);
      if (roleError) throw roleError;
    }
    return memberId;
  }

  /** Every notification of a type, addressed to a member, newest first. */
  async function feed(type: string, memberId?: string) {
    let query = admin
      .from("notifications")
      .select("id, type, member_id, user_id, title, body, deep_link, payload, tag")
      .eq("type", type)
      .eq("house_id", houseId)
      .order("created_at", { ascending: false });
    if (memberId) query = query.eq("member_id", memberId);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as {
      id: string;
      type: string;
      member_id: string | null;
      user_id: string | null;
      title: string;
      body: string;
      deep_link: string;
      payload: Record<string, unknown>;
      tag: string;
    }[];
  }

  interface DecisionSeed {
    type?: string;
    level?: "normal" | "important" | "critical";
    subjectMemberId?: string | null;
    deadline?: string | null;
    requiredApprovals?: number;
    participants: { memberId: string; capacity: "approver" | "acknowledger" }[];
  }

  /**
   * A decision and its participants, written with the service-role client.
   *
   * Deliberately two statements, which is to say two transactions. It is the
   * shape a deferred trigger on `decisions` would silently fail on, and the
   * reason N-32 hangs off the participant rows instead.
   */
  async function seedDecision(seed: DecisionSeed): Promise<string> {
    const level = seed.level ?? "critical";
    const { data, error } = await admin
      .from("decisions")
      .insert({
        house_id: houseId,
        type: seed.type ?? "remove_member",
        level,
        requested_by: lead.memberId,
        subject_member_id: seed.subjectMemberId ?? null,
        reason: level === "critical" ? "A reason of adequate length" : null,
        required_approvals: seed.requiredApprovals ?? 0,
        required_acks: 0,
        deadline: seed.deadline ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    const decisionId = (data as { id: string }).id;

    if (seed.participants.length > 0) {
      const { error: participantError } = await admin
        .from("decision_participants")
        .insert(
          seed.participants.map((participant) => ({
            decision_id: decisionId,
            member_id: participant.memberId,
            capacity: participant.capacity,
            is_mandatory: false,
          })),
        );
      if (participantError) throw participantError;
    }

    return decisionId;
  }

  beforeAll(async () => {
    const leadUser = await signUp("lead");
    const { data, error } = await leadUser.client.rpc("create_house", {
      p_name: "Notification House",
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (data as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);
    lead = { ...leadUser, memberId: await memberIdOf(houseId, leadUser.userId) };

    const coLeadUser = await signUp("colead");
    coLead = { ...coLeadUser, memberId: await join(coLeadUser, houseId, "co_admin") };

    const oneUser = await signUp("one");
    one = { ...oneUser, memberId: await join(oneUser, houseId, "member") };

    const twoUser = await signUp("two");
    two = { ...twoUser, memberId: await join(twoUser, houseId, "member") };

    outsider = await signUp("outsider");
  }, 90_000);

  afterAll(async () => {
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // N-32 and N-42 — the proposal
  // -------------------------------------------------------------------------

  it("tells every participant, and only the participants", async () => {
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "acknowledger" },
      ],
    });

    const rows = (await feed("N-32")).filter(
      (row) => row.payload.decision_id === decisionId,
    );

    expect(rows.map((row) => row.member_id).sort()).toEqual(
      [one.memberId, two.memberId].sort(),
    );
    expect(rows.every((row) => row.deep_link === `/more/approvals/${decisionId}`)).toBe(true);
  });

  it("asks an approver to approve and an acknowledger to acknowledge", async () => {
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "acknowledger" },
      ],
    });

    const rows = (await feed("N-32")).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    const forOne = rows.find((row) => row.member_id === one.memberId)!;
    const forTwo = rows.find((row) => row.member_id === two.memberId)!;

    expect(forOne.body).toContain("You need to approve this");
    expect(forTwo.body).toContain("You need to acknowledge this");
    // Two participants, so each is told one other person was asked.
    expect(forOne.body).toContain("1 others too");
  });

  it("tells the person being removed, at proposal time, though they never vote", async () => {
    const decisionId = await seedDecision({
      type: "remove_member",
      subjectMemberId: two.memberId,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: coLead.memberId, capacity: "approver" },
      ],
    });

    const removal = (await feed("N-42")).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    expect(removal).toHaveLength(1);
    expect(removal[0].member_id).toBe(two.memberId);
    expect(removal[0].body).toContain("the house is deciding");

    // The subject is never a participant (migration 051), so they are not also
    // asked to answer their own removal.
    const asked = (await feed("N-32")).filter(
      (row) => row.payload.decision_id === decisionId && row.member_id === two.memberId,
    );
    expect(asked).toHaveLength(0);
  });

  it("asks nobody about a decision that resolved before it was committed", async () => {
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      participants: [],
    });

    const { error } = await admin
      .from("decisions")
      .update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("id", decisionId);
    if (error) throw error;

    const { error: participantError } = await admin.from("decision_participants").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      is_mandatory: false,
    });
    if (participantError) throw participantError;

    const rows = (await feed("N-32")).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // N-34, N-35, N-36 — the outcome
  // -------------------------------------------------------------------------

  it("tells the whole Home when a decision resolves", async () => {
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      participants: [{ memberId: one.memberId, capacity: "approver" }],
    });

    const { error } = await admin
      .from("decisions")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", decisionId);
    if (error) throw error;

    const rows = (await feed("N-34")).filter(
      (row) => row.payload.decision_id === decisionId,
    );

    expect(rows.map((row) => row.member_id).sort()).toEqual(
      [lead.memberId, coLead.memberId, one.memberId, two.memberId].sort(),
    );
    expect(rows[0].title).toContain("approved");
  });

  it("tells the proposer who said no, and why", async () => {
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      requiredApprovals: 1,
      participants: [{ memberId: one.memberId, capacity: "approver" }],
    });

    const { error: responseError } = await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      response: "reject",
      reason: "The kitchen rota does not work like that",
    });
    if (responseError) throw responseError;

    const { error } = await admin.rpc("resolve_decision", { p_decision_id: decisionId });
    if (error) throw error;

    const rows = (await feed("N-35")).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].member_id).toBe(lead.memberId);
    expect(rows[0].body).toContain("The kitchen rota does not work like that");
  });

  it("tells the proposer and everybody who answered when it lapses", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      requiredApprovals: 2,
      deadline: past,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { error: responseError } = await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      response: "approve",
    });
    if (responseError) throw responseError;

    const { data: moved, error } = await admin.rpc("expire_decisions");
    if (error) throw error;
    expect(moved as number).toBeGreaterThanOrEqual(1);

    const { data: after } = await admin
      .from("decisions")
      .select("status")
      .eq("id", decisionId)
      .single();
    expect((after as { status: string }).status).toBe("lapsed");

    const rows = (await feed("N-36")).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    // The proposer, and the one person who did answer. Not the member who
    // ignored it — they are told nothing they did not already know.
    expect(rows.map((row) => row.member_id).sort()).toEqual(
      [lead.memberId, one.memberId].sort(),
    );
  });

  // -------------------------------------------------------------------------
  // N-33 — the reminder job
  // -------------------------------------------------------------------------

  it("reminds only the people who have not answered, and only once", async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      requiredApprovals: 2,
      deadline: soon,
      participants: [
        { memberId: one.memberId, capacity: "approver" },
        { memberId: two.memberId, capacity: "approver" },
      ],
    });

    const { error: responseError } = await one.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: one.memberId,
      capacity: "approver",
      response: "approve",
    });
    if (responseError) throw responseError;

    const { error } = await admin.rpc("remind_decision_participants");
    if (error) throw error;

    let rows = (await feed("N-33")).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    expect(rows.map((row) => row.member_id)).toEqual([two.memberId]);

    // The job runs hourly. A second run inside the same window must not send a
    // second reminder for the same decision.
    const { error: secondError } = await admin.rpc("remind_decision_participants");
    if (secondError) throw secondError;

    rows = (await feed("N-33")).filter((row) => row.payload.decision_id === decisionId);
    expect(rows).toHaveLength(1);
  });

  it("leaves a decision alone while its deadline is more than a day away", async () => {
    const far = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      requiredApprovals: 1,
      deadline: far,
      participants: [{ memberId: two.memberId, capacity: "approver" }],
    });

    const { error } = await admin.rpc("remind_decision_participants");
    if (error) throw error;

    const rows = (await feed("N-33")).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // N-38 to N-41 — joining
  // -------------------------------------------------------------------------

  it("tells both leads when somebody asks to join, and no ordinary member", async () => {
    const asker = await signUp("asker");
    const requestId = await requestJoin(asker, houseId, "I take the small room");

    const rows = (await feed("N-38")).filter(
      (row) => row.payload.join_request_id === requestId,
    );

    expect(rows.map((row) => row.member_id).sort()).toEqual(
      [lead.memberId, coLead.memberId].sort(),
    );
    expect(rows[0].body).toContain("I take the small room");

    const { error } = await lead.client.rpc("accept_join_request", {
      p_request_id: requestId,
    });
    if (error) throw error;

    const newMemberId = await memberIdOf(houseId, asker.userId);

    const accepted = (await feed("N-39")).filter(
      (row) => row.payload.join_request_id === requestId,
    );
    expect(accepted.map((row) => row.member_id)).toEqual([newMemberId]);

    // N-41 is house news, and the new member is not told about their own
    // arrival — they have just been told in N-39.
    const announced = (await feed("N-41")).filter(
      (row) => (row.payload as { member_id?: string }).member_id === newMemberId,
    );
    expect(announced.map((row) => row.member_id)).not.toContain(newMemberId);
    expect(announced.length).toBeGreaterThanOrEqual(4);
  });

  it("tells a declined requester, who has no membership to address it to", async () => {
    const requestId = await requestJoin(outsider, houseId);

    const { error } = await lead.client.rpc("decline_join_request", {
      p_request_id: requestId,
      p_reason: "The room is taken",
    });
    if (error) throw error;

    const rows = (await feed("N-40")).filter(
      (row) => row.payload.join_request_id === requestId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].member_id).toBeNull();
    expect(rows[0].user_id).toBe(outsider.userId);
    expect(rows[0].body).toContain("The room is taken");
  });

  it("lets the declined requester read it, and nobody else", async () => {
    const { data: mine } = await outsider.client
      .from("notifications")
      .select("id, type")
      .eq("type", "N-40");
    expect((mine ?? []).length).toBeGreaterThanOrEqual(1);

    const { data: theirs } = await one.client
      .from("notifications")
      .select("id")
      .eq("type", "N-40");
    expect(theirs ?? []).toHaveLength(0);
  });

  it("refuses a notification addressed to a member and a user at once", async () => {
    const { error } = await admin.from("notifications").insert({
      house_id: houseId,
      member_id: one.memberId,
      user_id: outsider.userId,
      type: "N-40",
      title: "x",
      body: "x",
    });

    expect(error?.message ?? "").toContain("notification_has_one_addressee");
  });

  // -------------------------------------------------------------------------
  // N-43 and N-44 — what happens to a membership
  // -------------------------------------------------------------------------

  it("tells a new co-admin what changed", async () => {
    const promoted = await signUp("promoted");
    const memberId = await join(promoted, houseId, "member");

    const { error } = await admin
      .from("house_members")
      .update({ role: "co_admin" })
      .eq("id", memberId);
    if (error) throw error;

    const rows = (await feed("N-44")).filter(
      (row) => (row.payload as { member_id?: string }).member_id === memberId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].member_id).toBe(memberId);
  });

  it("reaches a member who has just stopped being active", async () => {
    const leaving = await signUp("leaving");
    const memberId = await join(leaving, houseId, "member");

    const { error } = await admin
      .from("house_members")
      .update({
        status: "inactive",
        pending_settlement: true,
        left_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", memberId);
    if (error) throw error;

    const rows = (await feed("N-43")).filter((row) => row.member_id === memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("still to settle");
  });

  // -------------------------------------------------------------------------
  // Section 6 — the switch that is not a switch
  // -------------------------------------------------------------------------

  it("keeps decision requests on however the member sets their preferences", async () => {
    const { error } = await one.client.rpc("set_notification_prefs", {
      p_house_activity: false,
      p_decision_outcomes: false,
    });
    if (error) throw error;

    const { data } = await admin
      .from("notification_prefs")
      .select("decisions, decision_outcomes, house_activity, settlement_updates")
      .eq("member_id", one.memberId)
      .single();

    const prefs = data as {
      decisions: boolean;
      decision_outcomes: boolean;
      house_activity: boolean;
      settlement_updates: boolean;
    };

    expect(prefs.decisions).toBe(true);
    expect(prefs.settlement_updates).toBe(true);
    expect(prefs.decision_outcomes).toBe(false);
    expect(prefs.house_activity).toBe(false);
  });

  it("writes the feed row even for a category the member switched off", async () => {
    const decisionId = await seedDecision({
      type: "change_rule",
      level: "important",
      participants: [{ memberId: one.memberId, capacity: "approver" }],
    });

    const { error } = await admin
      .from("decisions")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", decisionId);
    if (error) throw error;

    // Section 1: every notification is written to the feed regardless of what
    // push does with it. The preference silences the interruption, not the
    // record.
    const rows = (await feed("N-34", one.memberId)).filter(
      (row) => row.payload.decision_id === decisionId,
    );
    expect(rows).toHaveLength(1);
  });
});
