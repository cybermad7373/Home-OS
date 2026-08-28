import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 11 — the size-aware chore confirmation quorum, in a real Postgres.
 *
 * `tests/unit/governance.test.ts` already proves `quorumFor` over Home sizes
 * without a database. This suite proves the other half: that migration 054's
 * PL/pgSQL restatement agrees with it, that the snapshot really is a snapshot,
 * and that the three bans — your own work, your dependent's work, and twice —
 * hold against a client holding the service-role key, which bypasses RLS and
 * does not bypass a trigger (D-06).
 *
 * The acceptance criteria it exists for, from docs/07-ROADMAP.md phase 11:
 *
 *   "A four-person Home's chore requires an Admin or Co-Admin plus one other;
 *    three ordinary members confirming it does not confirm it."
 *   "The quorum snapshotted at 'done' does not move when somebody joins
 *    mid-window."
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/chore-quorum
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
 * 054 may not be applied to whatever this run is pointed at. A missing table
 * is a state of the environment rather than a defect, so the suite skips — the
 * same shape `governance.test.ts` uses for 051 to 053.
 */
const migrated = configured
  ? await admin
      .from("chore_confirmations")
      .select("id")
      .limit(1)
      .then(({ error }) => !error)
  : false;

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface Actor {
  userId: string;
  memberId: string;
  client: SupabaseClient;
}

describeIfReady("the chore confirmation quorum", () => {
  /** Six adults: an Admin, a Co-Admin, and four ordinary members. */
  let lead: Actor;
  let coLead: Actor;
  let one: Actor;
  let two: Actor;
  let three: Actor;
  let four: Actor;

  let houseId: string;
  let templateId: string;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  /** A Monday, safely in the past so deadlines do not interfere. */
  const weekStart = "2026-08-17";

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const { data, error } = await admin.auth.admin.createUser({
      email: `quorum-${label}-${stamp}@houseos.test`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;
    userIds.push(data.user!.id);

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email: `quorum-${label}-${stamp}@houseos.test`,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    return { userId: data.user!.id, client };
  }

  async function makeHome(actor: Omit<Actor, "memberId">, name: string): Promise<string> {
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

  /**
   * Added directly rather than through the join flow. What is under test is
   * the quorum, and `membership.test.ts` already covers the road in.
   */
  async function addMember(
    house: string,
    actor: Omit<Actor, "memberId">,
    role: "co_admin" | "member",
  ): Promise<string> {
    const { error } = await admin.from("house_members").insert({
      house_id: house,
      user_id: actor.userId,
      role,
      status: "active",
    });
    if (error) throw error;
    return memberIdOf(house, actor.userId);
  }

  async function templateOf(house: string): Promise<string> {
    const { data, error } = await admin
      .from("chore_templates")
      .select("id")
      .eq("house_id", house)
      .limit(1)
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async function makeAssignment(
    house: string,
    template: string,
    assignee: string,
    points = 30,
  ): Promise<string> {
    const { data, error } = await admin
      .from("chore_assignments")
      .insert({
        house_id: house,
        template_id: template,
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

  async function makeSharedAssignment(
    house: string,
    template: string,
    assignee: string,
    sharedWith: string[],
    points = 30,
  ): Promise<string> {
    const id = await makeAssignment(house, template, assignee, points);
    const { error } = await admin
      .from("chore_assignments")
      .update({ shared_with: sharedWith })
      .eq("id", id);
    if (error) throw error;
    return id;
  }

  async function earnedBy(memberId: string): Promise<number> {
    const { data } = await admin
      .from("effort_ledger")
      .select("earned_points")
      .eq("member_id", memberId)
      .eq("week_start", weekStart)
      .maybeSingle();
    return (data as { earned_points: number } | null)?.earned_points ?? 0;
  }

  async function assignmentRow(id: string) {
    const { data, error } = await admin
      .from("chore_assignments")
      .select(
        "status, confirmations_required, confirmations_received, requires_lead_confirmer, auto_confirmed, confirmed_by",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as {
      status: string;
      confirmations_required: number;
      confirmations_received: number;
      requires_lead_confirmer: boolean;
      auto_confirmed: boolean;
      confirmed_by: string | null;
    };
  }

  beforeAll(async () => {
    const leadUser = await signUp("lead");
    houseId = await makeHome(leadUser, `Quorum Home ${stamp}`);
    lead = { ...leadUser, memberId: await memberIdOf(houseId, leadUser.userId) };

    const coLeadUser = await signUp("colead");
    coLead = { ...coLeadUser, memberId: await addMember(houseId, coLeadUser, "co_admin") };

    const oneUser = await signUp("one");
    one = { ...oneUser, memberId: await addMember(houseId, oneUser, "member") };
    const twoUser = await signUp("two");
    two = { ...twoUser, memberId: await addMember(houseId, twoUser, "member") };
    const threeUser = await signUp("three");
    three = { ...threeUser, memberId: await addMember(houseId, threeUser, "member") };
    const fourUser = await signUp("four");
    four = { ...fourUser, memberId: await addMember(houseId, fourUser, "member") };

    templateId = await templateOf(houseId);
  }, 180_000);

  afterAll(async () => {
    if (!configured || houseIds.length === 0) return;
    for (const house of houseIds) {
      await admin.from("chore_confirmations").delete().eq("house_id", house);
      await admin.from("chore_assignments").delete().eq("house_id", house);
      await admin.from("effort_ledger").delete().eq("house_id", house);
      await admin.from("houses").delete().eq("id", house);
    }
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  }, 180_000);

  // -------------------------------------------------------------------------
  // The table from docs/14-GOVERNANCE-SPEC.md section 4
  // -------------------------------------------------------------------------

  it("reads the same counts the pure function does", async () => {
    const { data, error } = await admin.rpc("chore_quorum_for", {
      p_house_id: houseId,
      p_assignee_member_id: one.memberId,
    });
    expect(error).toBeNull();
    // Six active adults, five of them not the assignee: two confirmations,
    // one of which has to come from a lead.
    expect(data?.[0]).toMatchObject({
      required: 2,
      lead_required: true,
      auto_confirm: false,
    });
  });

  it("snapshots the quorum onto the assignment when it is marked done", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId);

    const done = await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(done.error).toBeNull();
    expect(done.data).toBe("done_pending");

    expect(await assignmentRow(assignmentId)).toMatchObject({
      confirmations_required: 2,
      confirmations_received: 0,
      requires_lead_confirmer: true,
    });
  });

  it("does not confirm on ordinary members alone, however many sign", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 30);
    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });

    for (const actor of [two, three, four]) {
      const { error } = await actor.client.rpc("confirm_chore", {
        p_assignment_id: assignmentId,
      });
      expect(error).toBeNull();
    }

    // Three signatures against a requirement of two, and still not confirmed:
    // the count is satisfied and the lead is not.
    const before = await assignmentRow(assignmentId);
    expect(before.status).toBe("done_pending");
    expect(before.confirmations_received).toBe(3);

    const { data: ledgerBefore } = await admin
      .from("effort_ledger")
      .select("earned_points")
      .eq("member_id", one.memberId)
      .eq("week_start", weekStart)
      .maybeSingle();
    const earnedBefore = (ledgerBefore as { earned_points: number } | null)?.earned_points ?? 0;

    const { error } = await coLead.client.rpc("confirm_chore", {
      p_assignment_id: assignmentId,
    });
    expect(error).toBeNull();

    const after = await assignmentRow(assignmentId);
    expect(after.status).toBe("confirmed");
    expect(after.confirmations_received).toBe(4);
    expect(after.auto_confirmed).toBe(false);
    expect(after.confirmed_by).toBe(coLead.memberId);

    const { data: ledgerAfter } = await admin
      .from("effort_ledger")
      .select("earned_points")
      .eq("member_id", one.memberId)
      .eq("week_start", weekStart)
      .single();
    expect((ledgerAfter as { earned_points: number }).earned_points).toBe(earnedBefore + 30);
  });

  it("does not move the goalposts when somebody joins mid-window", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);
    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect((await assignmentRow(assignmentId)).confirmations_required).toBe(2);

    // A seventh adult arrives between "done" and "confirmed". Live, the quorum
    // for a new chore is now three; this one keeps the two it was given.
    const newcomer = await signUp("newcomer");
    await addMember(houseId, newcomer, "member");

    const live = await admin.rpc("chore_quorum_for", {
      p_house_id: houseId,
      p_assignee_member_id: one.memberId,
    });
    expect(live.data?.[0]).toMatchObject({ required: 3, lead_required: true });

    await coLead.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    await two.client.rpc("confirm_chore", { p_assignment_id: assignmentId });

    const row = await assignmentRow(assignmentId);
    expect(row.confirmations_required).toBe(2);
    expect(row.status).toBe("confirmed");

    // Put the Home back to six for the tests that follow.
    await admin
      .from("house_members")
      .delete()
      .eq("house_id", houseId)
      .eq("user_id", newcomer.userId);
  });

  // -------------------------------------------------------------------------
  // The three bans, against the service-role key
  // -------------------------------------------------------------------------

  it("refuses the assignee's own signature, RLS bypassed", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);
    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });

    const friendly = await one.client.rpc("confirm_chore", {
      p_assignment_id: assignmentId,
    });
    expect(friendly.error?.message ?? "").toContain("SELF_CONFIRM");

    // The service role skipped every policy on the way in. The trigger does
    // not care who is asking.
    const { error } = await admin.from("chore_confirmations").insert({
      house_id: houseId,
      assignment_id: assignmentId,
      member_id: one.memberId,
    });
    expect(error?.message ?? "").toContain("SELF_CONFIRM");
  });

  it("counts people rather than signatures", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);
    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });

    await coLead.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    const again = await coLead.client.rpc("confirm_chore", {
      p_assignment_id: assignmentId,
    });
    expect(again.error?.message ?? "").toContain("ALREADY_CONFIRMED");

    // And with the friendly check skipped: the unique constraint is the one
    // that actually holds the rule.
    const { error } = await admin.from("chore_confirmations").insert({
      house_id: houseId,
      assignment_id: assignmentId,
      member_id: coLead.memberId,
    });
    expect(error).not.toBeNull();

    expect((await assignmentRow(assignmentId)).confirmations_received).toBe(1);
  });

  it("refuses a signature on a chore that is not waiting for one", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);

    const { error } = await admin.from("chore_confirmations").insert({
      house_id: houseId,
      assignment_id: assignmentId,
      member_id: two.memberId,
    });
    expect(error?.message ?? "").toContain("WRONG_STATE");
  });

  it("refuses a signature from somebody who is not an active adult of the Home", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);
    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });

    // A dependent is a head in the Home and not a voice in it. The `not an
    // active adult` half of the rule is checked with one of them rather than
    // by deactivating an adult with the service key: since 056 an adult's
    // `status` is writable only by a decision effect or the removal job, so
    // that route now raises `ADMIN_REQUIRED` before this trigger is reached.
    const { data: dependent, error: dependentError } = await lead.client.rpc("add_dependent", {
      p_house_id: houseId,
      p_name: `Ineligible ${stamp}`,
      p_guardian_id: coLead.memberId,
    });
    expect(dependentError).toBeNull();

    const { error } = await admin.from("chore_confirmations").insert({
      house_id: houseId,
      assignment_id: assignmentId,
      member_id: (dependent as { id: string }).id,
    });
    expect(error?.message ?? "").toContain("NOT_ELIGIBLE_CONFIRMER");
  });

  it("clears the signatures when the chore is rejected (one rejection ends it)", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);
    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    await two.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect((await assignmentRow(assignmentId)).confirmations_received).toBe(1);

    const rejected = await coLead.client.rpc("reject_chore", {
      p_assignment_id: assignmentId,
      p_reason: "The floor is still wet",
    });
    expect(rejected.data).toBe("rejected");

    const row = await assignmentRow(assignmentId);
    expect(row.status).toBe("rejected");
    expect(row.confirmations_received).toBe(0);

    const { data: left } = await admin
      .from("chore_confirmations")
      .select("id")
      .eq("assignment_id", assignmentId);
    expect(left ?? []).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // A guardian marks, and does not confirm (D-24)
  // -------------------------------------------------------------------------

  it("refuses the guardian of a dependent assignee", async () => {
    const { data: dependent, error: dependentError } = await lead.client.rpc("add_dependent", {
      p_house_id: houseId,
      p_name: `Child ${stamp}`,
      p_guardian_id: lead.memberId,
    });
    expect(dependentError).toBeNull();
    const dependentId = (dependent as { id: string }).id;

    const assignmentId = await makeAssignment(houseId, templateId, dependentId, 5);

    // The guardian marks it done — a dependent has no login (039).
    const done = await lead.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(done.error).toBeNull();

    const friendly = await lead.client.rpc("confirm_chore", {
      p_assignment_id: assignmentId,
    });
    expect(friendly.error?.message ?? "").toContain("SELF_CONFIRM");

    const { error } = await admin.from("chore_confirmations").insert({
      house_id: houseId,
      assignment_id: assignmentId,
      member_id: lead.memberId,
    });
    expect(error?.message ?? "").toContain("SELF_CONFIRM");

    // A dependent is a head in the Home and not a voice in it, so the quorum
    // was drawn from the six adults and the guardian is simply not in it.
    await coLead.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    await two.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect((await assignmentRow(assignmentId)).status).toBe("confirmed");
  });

  // -------------------------------------------------------------------------
  // The Home's own choice (CE-10), and the Home with nobody to ask
  // -------------------------------------------------------------------------

  it("drops to one signature under the `single` policy, and none under `off`", async () => {
    await admin
      .from("house_settings")
      .update({ confirmation_policy: "single" })
      .eq("house_id", houseId);

    const single = await admin.rpc("chore_quorum_for", {
      p_house_id: houseId,
      p_assignee_member_id: one.memberId,
    });
    expect(single.data?.[0]).toMatchObject({
      required: 1,
      lead_required: false,
      auto_confirm: false,
    });

    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);
    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    await two.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect((await assignmentRow(assignmentId)).status).toBe("confirmed");

    await admin
      .from("house_settings")
      .update({ confirmation_policy: "off" })
      .eq("house_id", houseId);

    const off = await makeAssignment(houseId, templateId, one.memberId, 10);
    const done = await one.client.rpc("mark_chore_done", {
      p_assignment_id: off,
      p_photo_url: null,
    });
    expect(done.data).toBe("confirmed");
    expect(await assignmentRow(off)).toMatchObject({
      status: "confirmed",
      confirmations_required: 0,
      auto_confirmed: true,
      confirmed_by: null,
    });

    await admin
      .from("house_settings")
      .update({ confirmation_policy: "size_aware" })
      .eq("house_id", houseId);
  });

  it("confirms on the spot in a Home with nobody to ask", async () => {
    const soloUser = await signUp("solo");
    const soloHouse = await makeHome(soloUser, `Solo Home ${stamp}`);
    const soloMember = await memberIdOf(soloHouse, soloUser.userId);
    const soloTemplate = await templateOf(soloHouse);

    const assignmentId = await makeAssignment(soloHouse, soloTemplate, soloMember, 20);
    const done = await soloUser.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(done.error).toBeNull();
    // Confirmed now, rather than sitting in done_pending until the
    // auto-confirm window notices the same thing.
    expect(done.data).toBe("confirmed");

    expect(await assignmentRow(assignmentId)).toMatchObject({
      status: "confirmed",
      confirmations_required: 0,
      auto_confirmed: true,
      confirmed_by: null,
    });

    const { data: ledger } = await admin
      .from("effort_ledger")
      .select("earned_points")
      .eq("member_id", soloMember)
      .eq("week_start", weekStart)
      .single();
    expect((ledger as { earned_points: number }).earned_points).toBe(20);
  });
  // -------------------------------------------------------------------------
  // A chore two people did together (CE-11)
  // -------------------------------------------------------------------------

  it("divides a shared chore's points exactly, with nothing lost to rounding", async () => {
    const before = {
      one: await earnedBy(one.memberId),
      two: await earnedBy(two.memberId),
      three: await earnedBy(three.memberId),
    };

    const assignmentId = await makeSharedAssignment(
      houseId,
      templateId,
      one.memberId,
      [two.memberId, three.memberId],
      25,
    );

    await one.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    await coLead.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    await four.client.rpc("confirm_chore", { p_assignment_id: assignmentId });
    expect((await assignmentRow(assignmentId)).status).toBe("confirmed");

    const shares = [
      (await earnedBy(one.memberId)) - before.one,
      (await earnedBy(two.memberId)) - before.two,
      (await earnedBy(three.memberId)) - before.three,
    ];

    // Twenty-five points among three people: 9 / 8 / 8 in member-id order,
    // and never 24 and never 27.
    expect([...shares].sort()).toEqual([8, 8, 9]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(25);
  });

  it("lets neither shared assignee confirm the chore they both did", async () => {
    const assignmentId = await makeSharedAssignment(
      houseId,
      templateId,
      one.memberId,
      [two.memberId],
      12,
    );

    // The person it is shared with may mark it done — they did the work too.
    const done = await two.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(done.error).toBeNull();
    expect(done.data).toBe("done_pending");

    const friendly = await two.client.rpc("confirm_chore", {
      p_assignment_id: assignmentId,
    });
    expect(friendly.error?.message ?? "").toContain("SELF_CONFIRM");

    // And the trigger says the same thing to the service-role key (D-06).
    const { error } = await admin.from("chore_confirmations").insert({
      house_id: houseId,
      assignment_id: assignmentId,
      member_id: two.memberId,
    });
    expect(error?.message ?? "").toContain("SELF_CONFIRM");

    // Neither may reject their own work either.
    const rejected = await two.client.rpc("reject_chore", {
      p_assignment_id: assignmentId,
      p_reason: "Marking our own homework",
    });
    expect(rejected.error?.message ?? "").toContain("SELF_REJECT");
  });

  it("refuses a shared_with that names the assignee, a duplicate, or an outsider", async () => {
    const assignmentId = await makeAssignment(houseId, templateId, one.memberId, 10);

    const self = await admin
      .from("chore_assignments")
      .update({ shared_with: [one.memberId] })
      .eq("id", assignmentId);
    expect(self.error?.message ?? "").toContain("SHARED_WITH_INCLUDES_ASSIGNEE");

    const twice = await admin
      .from("chore_assignments")
      .update({ shared_with: [two.memberId, two.memberId] })
      .eq("id", assignmentId);
    expect(twice.error?.message ?? "").toContain("SHARED_WITH_DUPLICATE");

    const outsider = await admin
      .from("chore_assignments")
      .update({ shared_with: [crypto.randomUUID()] })
      .eq("id", assignmentId);
    expect(outsider.error?.message ?? "").toContain("SHARED_WITH_NOT_A_MEMBER");
  });

  it("confirms a shared chore on the spot when its assignees are the whole Home", async () => {
    const firstUser = await signUp("pair-a");
    const pairHouse = await makeHome(firstUser, `Pair Home ${stamp}`);
    const first = { ...firstUser, memberId: await memberIdOf(pairHouse, firstUser.userId) };

    const secondUser = await signUp("pair-b");
    const second = {
      ...secondUser,
      memberId: await addMember(pairHouse, secondUser, "member"),
    };

    const pairTemplate = await templateOf(pairHouse);
    const assignmentId = await makeSharedAssignment(
      pairHouse,
      pairTemplate,
      first.memberId,
      [second.memberId],
      11,
    );

    // Both adults are assignees, so the eligible pool is empty. Blocking the
    // chore until the auto-confirm window would be the same answer, later.
    const done = await first.client.rpc("mark_chore_done", {
      p_assignment_id: assignmentId,
      p_photo_url: null,
    });
    expect(done.error).toBeNull();
    expect(done.data).toBe("confirmed");

    expect(await assignmentRow(assignmentId)).toMatchObject({
      status: "confirmed",
      confirmations_required: 0,
      auto_confirmed: true,
      confirmed_by: null,
    });

    // Eleven points between two: 6 and 5.
    const shares = [await earnedBy(first.memberId), await earnedBy(second.memberId)];
    expect([...shares].sort()).toEqual([5, 6]);
  });
});
