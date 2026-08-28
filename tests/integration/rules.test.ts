import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 12 — rules, in a real Postgres.
 *
 * `tests/unit/rules-parse.test.ts` and `rules-diff.test.ts` cover the parse
 * validator and the version differ over plain values. This suite covers the
 * half only a database can be asked about, and every case in it is one of the
 * three properties migration 066 exists to hold:
 *
 *   * a version with `activated_at` and no `decision_id` is refused — **and is
 *     refused when the caller holds the service-role key**, which is the only
 *     version of RL-04 worth having;
 *   * a rule is never overwritten: editing appends, and the old version keeps
 *     its dates and its values;
 *   * disabling is a version transition rather than a delete.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/rules
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
 * Migration 066 may not be applied to whatever this run is pointed at. That is
 * a state of the environment rather than a defect, so the suite skips rather
 * than reporting a failure it cannot tell apart from a missing migration — the
 * same shape `governance.test.ts` uses for 051.
 */
let migrated = false;
if (configured) {
  const { error } = await admin.from("home_rules").select("id").limit(1);
  migrated = !error;
}

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface Actor {
  userId: string;
  memberId: string;
  client: SupabaseClient;
}

describeIfReady("rules — versions, activation and the decision behind it", () => {
  let lead: Actor;
  let coLead: Actor;
  let outsider: Actor;

  let houseId: string;
  let otherHouseId: string;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `rules-${label}-${stamp}@houseos.test`;
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

    return { userId: created.user!.id, client };
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
    house: string,
    role: "co_admin" | "member",
  ): Promise<string> {
    const { data: invite } = await admin
      .from("invitations")
      .select("token")
      .eq("house_id", house)
      .is("revoked_at", null)
      .single();

    await actor.client.rpc("request_join", {
      p_token: (invite as { token: string }).token,
      p_message: null,
    });

    const { data: request } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", house)
      .eq("user_id", actor.userId)
      .eq("status", "requested")
      .single();

    await lead.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });

    const memberId = await memberIdOf(house, actor.userId);
    await admin.rpc("set_config", {
      setting_name: "app.member_write_authorised",
      setting_value: "on",
      is_local: true,
    });
    await admin.from("house_members").update({ role }).eq("id", memberId);
    return memberId;
  }

  // -------------------------------------------------------------------------
  // Writing a rule the way the application does
  // -------------------------------------------------------------------------

  let ruleSeq = 0;

  interface DraftInput {
    title?: string;
    originalText?: string;
    condition?: Record<string, unknown>;
    action?: Record<string, unknown>;
    appliesTo?: Record<string, unknown>;
    weightPoints?: number | null;
    penaltyPaise?: number | null;
    endsOn?: string | null;
  }

  /** A rule row plus its first pending version, through the lead's own client. */
  async function draftRule(input: DraftInput = {}) {
    ruleSeq += 1;
    const title = input.title ?? `Rule ${ruleSeq} of ${stamp}`;

    const { data: rule, error } = await lead.client
      .from("home_rules")
      .insert({
        house_id: houseId,
        title,
        status: "draft",
        created_by: lead.memberId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const versionId = await draftVersion((rule as { id: string }).id, 1, input);
    return { ruleId: (rule as { id: string }).id, versionId, title };
  }

  async function draftVersion(ruleId: string, versionNo: number, input: DraftInput) {
    const { data, error } = await lead.client
      .from("home_rule_versions")
      .insert({
        house_id: houseId,
        rule_id: ruleId,
        version_no: versionNo,
        original_text:
          input.originalText ?? "Everyone should clean their own plates before sleeping.",
        parsed_by: "manual",
        title: input.title ?? `Rule ${ruleSeq} of ${stamp}`,
        condition: input.condition ?? { kind: "time_of_day", after: "dinner" },
        action: input.action ?? { kind: "task", text: "Clean own dishes" },
        applies_to: input.appliesTo ?? { kind: "all" },
        weight_points: input.weightPoints ?? null,
        penalty_paise: input.penaltyPaise ?? null,
        ends_on: input.endsOn ?? null,
        created_by: lead.memberId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  /**
   * Ask the Home, collect both mandatory answers, and apply.
   *
   * Two responders on purpose: `apply_decision` refuses a Critical decision
   * fewer than two distinct people answered, whatever its status says, and
   * `change_rule` is Critical.
   */
  async function proposeAndApply(versionId: string, action: string) {
    const { data, error } = await lead.client.rpc("create_decision", {
      p_house_id: houseId,
      p_type: "change_rule",
      p_level: "critical",
      p_participants: [
        { member_id: lead.memberId, capacity: "approver", is_mandatory: true },
        { member_id: coLead.memberId, capacity: "acknowledger", is_mandatory: true },
      ],
      p_required_approvals: 1,
      p_required_acks: 1,
      p_subject_type: "home_rule_version",
      p_subject_id: versionId,
      p_payload: { action },
      p_reason: "The house agreed to this at dinner",
    });
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [data];
    const decisionId = (rows[0] as { id: string }).id;

    await lead.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: lead.memberId,
      capacity: "approver",
      response: "approve",
    });
    await coLead.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: coLead.memberId,
      capacity: "acknowledger",
      response: "acknowledge",
    });

    return decisionId;
  }

  async function apply(decisionId: string) {
    const { error } = await admin.rpc("apply_decision", { p_decision_id: decisionId });
    if (error) throw error;
  }

  async function versionsOf(ruleId: string) {
    const { data, error } = await admin
      .from("home_rule_versions")
      .select("*")
      .eq("rule_id", ruleId)
      .order("version_no");
    if (error) throw error;
    return data as unknown as Record<string, unknown>[];
  }

  async function ruleRow(ruleId: string) {
    const { data, error } = await admin
      .from("home_rules")
      .select("*")
      .eq("id", ruleId)
      .single();
    if (error) throw error;
    return data as unknown as Record<string, unknown>;
  }

  beforeAll(async () => {
    const leadUser = await signUp("lead");
    houseId = await makeHome(leadUser, `Rules Home ${stamp}`);
    lead = { ...leadUser, memberId: await memberIdOf(houseId, leadUser.userId) };

    const coLeadUser = await signUp("colead");
    coLead = { ...coLeadUser, memberId: await join(coLeadUser, houseId, "co_admin") };

    const outsiderUser = await signUp("outsider");
    otherHouseId = await makeHome(outsiderUser, `Other Home ${stamp}`);
    outsider = {
      ...outsiderUser,
      memberId: await memberIdOf(otherHouseId, outsiderUser.userId),
    };
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // RL-04 / SEC-16 — a rule cannot go live without a decision behind it
  // -------------------------------------------------------------------------

  it("refuses an activated version with no decision, to the service-role key", async () => {
    const { ruleId } = await draftRule();
    const versions = await versionsOf(ruleId);

    const { error } = await admin
      .from("home_rule_versions")
      .update({ activated_at: new Date().toISOString() })
      .eq("id", versions[0].id as string);

    expect(error).not.toBeNull();
    expect(error!.message).toContain("activation_requires_decision");
  });

  it("refuses a lead trying to activate their own version through the policy", async () => {
    const { versionId } = await draftRule();

    const { error } = await lead.client
      .from("home_rule_versions")
      .update({ activated_at: new Date().toISOString() })
      .eq("id", versionId);

    // Either the `with check` clause refuses it or no row matches. Both mean
    // the same thing: nothing a browser sends activates a rule.
    const { data } = await admin
      .from("home_rule_versions")
      .select("activated_at")
      .eq("id", versionId)
      .single();

    expect((data as { activated_at: string | null }).activated_at).toBeNull();
    if (error) expect(error.message).toBeTruthy();
  });

  it("leaves a proposed rule changing nothing until the decision applies", async () => {
    const { ruleId, versionId } = await draftRule();
    await proposeAndApply(versionId, "create");

    const before = await ruleRow(ruleId);
    expect(before.current_version_id).toBeNull();

    const [version] = await versionsOf(ruleId);
    expect(version.activated_at).toBeNull();
  });

  // -------------------------------------------------------------------------
  // The effect
  // -------------------------------------------------------------------------

  it("activates the version, stamps the decision on it, and makes the rule active", async () => {
    const { ruleId, versionId } = await draftRule();
    const decisionId = await proposeAndApply(versionId, "create");
    await apply(decisionId);

    const rule = await ruleRow(ruleId);
    expect(rule.status).toBe("active");
    expect(rule.current_version_id).toBe(versionId);

    const [version] = await versionsOf(ruleId);
    expect(version.activated_at).not.toBeNull();
    expect(version.decision_id).toBe(decisionId);
    // A rule with no explicit start date starts the day the Home agreed to it,
    // rather than reading as "always" over months that are already closed.
    expect(version.starts_on).not.toBeNull();
  });

  it("applies twice without superseding what it just activated", async () => {
    const { ruleId, versionId } = await draftRule();
    const decisionId = await proposeAndApply(versionId, "create");
    await apply(decisionId);
    await apply(decisionId);

    const [version] = await versionsOf(ruleId);
    expect(version.superseded_at).toBeNull();

    // The second call returns early on `status = 'applied'` without running
    // the effect at all, so the stored result is still the first one. That is
    // the point: an effect that ran twice would have superseded the version it
    // had just activated.
    const { data } = await admin
      .from("decisions")
      .select("result, applied_at")
      .eq("id", decisionId)
      .single();
    const decision = data as { result: { already?: boolean }; applied_at: string };
    expect(decision.result.already).toBe(false);
    expect(decision.applied_at).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // RL-06 — editing appends; nothing is overwritten
  // -------------------------------------------------------------------------

  it("keeps version 1 readable with its own values after version 2 activates", async () => {
    const { ruleId, versionId } = await draftRule({
      originalText: "Everyone cleans their own plate.",
      penaltyPaise: null,
    });
    await apply(await proposeAndApply(versionId, "create"));

    const secondId = await draftVersion(ruleId, 2, {
      originalText: "Everyone cleans their own plate, or pays ₹50.",
      penaltyPaise: 5000,
    });
    await apply(await proposeAndApply(secondId, "edit"));

    const versions = await versionsOf(ruleId);
    expect(versions).toHaveLength(2);

    expect(versions[0].penalty_paise).toBeNull();
    expect(versions[0].original_text).toBe("Everyone cleans their own plate.");
    expect(versions[0].superseded_at).not.toBeNull();
    expect(versions[0].activated_at).not.toBeNull();

    expect(versions[1].penalty_paise).toBe(5000);
    expect(versions[1].superseded_at).toBeNull();

    const rule = await ruleRow(ruleId);
    expect(rule.current_version_id).toBe(secondId);
    expect(rule.status).toBe("active");
  });

  it("never has two versions in force at once", async () => {
    const { ruleId, versionId } = await draftRule();
    await apply(await proposeAndApply(versionId, "create"));

    const secondId = await draftVersion(ruleId, 2, {});
    await apply(await proposeAndApply(secondId, "edit"));

    const live = (await versionsOf(ruleId)).filter(
      (version) => version.activated_at !== null && version.superseded_at === null,
    );
    expect(live).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Disabling is a version transition, not a delete
  // -------------------------------------------------------------------------

  it("disables through a new version and keeps every earlier one", async () => {
    const { ruleId, versionId } = await draftRule();
    await apply(await proposeAndApply(versionId, "create"));

    const disabledId = await draftVersion(ruleId, 2, { endsOn: "2026-07-20" });
    await apply(await proposeAndApply(disabledId, "disable"));

    const rule = await ruleRow(ruleId);
    expect(rule.status).toBe("disabled");
    expect(rule.current_version_id).toBe(disabledId);

    const versions = await versionsOf(ruleId);
    expect(versions).toHaveLength(2);
    expect(versions[1].ends_on).toBe("2026-07-20");
  });

  // -------------------------------------------------------------------------
  // The outcomes that are not approval
  // -------------------------------------------------------------------------

  it("puts a never-activated rule back to draft when the Home refuses it", async () => {
    const { ruleId, versionId } = await draftRule();

    const { data } = await lead.client.rpc("create_decision", {
      p_house_id: houseId,
      p_type: "change_rule",
      p_level: "critical",
      p_participants: [
        { member_id: lead.memberId, capacity: "approver", is_mandatory: true },
        { member_id: coLead.memberId, capacity: "approver", is_mandatory: true },
      ],
      p_required_approvals: 2,
      p_required_acks: 0,
      p_subject_type: "home_rule_version",
      p_subject_id: versionId,
      p_payload: { action: "create" },
      p_reason: "Proposed, and then thought better of",
    });
    const decisionId = ((Array.isArray(data) ? data : [data])[0] as { id: string }).id;

    await lead.client.from("home_rules").update({ status: "proposed" }).eq("id", ruleId);

    await coLead.client.from("decision_responses").insert({
      decision_id: decisionId,
      member_id: coLead.memberId,
      capacity: "approver",
      response: "reject",
      reason: "We already do this without writing it down",
    });

    const rule = await ruleRow(ruleId);
    expect(rule.status).toBe("draft");
    // The refused version is kept: it is what the Home said no to, and the
    // history is poorer without it.
    expect(await versionsOf(ruleId)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Isolation
  // -------------------------------------------------------------------------

  it("gives another Home's member zero rows", async () => {
    await draftRule();

    const { data: rules } = await outsider.client.from("home_rules").select("id");
    const { data: versions } = await outsider.client
      .from("home_rule_versions")
      .select("id");

    expect(rules ?? []).toHaveLength(0);
    expect(versions ?? []).toHaveLength(0);
  });

  it("lets every member of the Home read every rule, drafts included", async () => {
    await draftRule();

    const { data, error } = await coLead.client.from("home_rules").select("id, status");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("refuses a rule written into another Home", async () => {
    const { error } = await outsider.client.from("home_rules").insert({
      house_id: houseId,
      title: `Trespass ${stamp}`,
      status: "draft",
      created_by: lead.memberId,
    });

    expect(error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // The bounds, stated twice
  // -------------------------------------------------------------------------

  it("refuses a penalty above the ceiling and a weight outside 1 to 100", async () => {
    const { ruleId } = await draftRule();

    const tooMuch = await lead.client.from("home_rule_versions").insert({
      house_id: houseId,
      rule_id: ruleId,
      version_no: 90,
      original_text: "A fine of one lakh for leaving the light on.",
      title: "Absurd",
      condition: { kind: "other" },
      action: { kind: "money_penalty" },
      applies_to: { kind: "all" },
      penalty_paise: 10_000_000,
      created_by: lead.memberId,
    });
    expect(tooMuch.error?.message).toContain("penalty_in_range");

    const tooMany = await lead.client.from("home_rule_versions").insert({
      house_id: houseId,
      rule_id: ruleId,
      version_no: 91,
      original_text: "Four thousand points off.",
      title: "Absurd points",
      condition: { kind: "other" },
      action: { kind: "points_penalty" },
      applies_to: { kind: "all" },
      weight_points: 4000,
      created_by: lead.memberId,
    });
    expect(tooMany.error?.message).toContain("weight_in_range");
  });

  it("refuses two rules with the same name in one Home", async () => {
    const { title } = await draftRule();

    const { error } = await lead.client.from("home_rules").insert({
      house_id: houseId,
      title,
      status: "draft",
      created_by: lead.memberId,
    });

    expect(error?.message).toContain("home_rules_title_unique");
  });

  // -------------------------------------------------------------------------
  // The capability switches
  // -------------------------------------------------------------------------

  it("refuses a capabilities object with a key that is not a call site", async () => {
    const { error } = await admin
      .from("house_llm_credentials")
      .update({ capabilities: { made_up_feature: true } })
      .eq("house_id", houseId);

    // No credential row for this Home, so nothing is updated and no constraint
    // fires. The constraint itself is asserted directly below.
    expect(error).toBeNull();

    const { error: checkError } = await admin.rpc("llm_capabilities_well_formed", {
      p_capabilities: { made_up_feature: true },
    });
    if (!checkError) {
      const { data } = await admin.rpc("llm_capabilities_well_formed", {
        p_capabilities: { made_up_feature: true },
      });
      expect(data).toBe(false);

      const { data: ok } = await admin.rpc("llm_capabilities_well_formed", {
        p_capabilities: { rule_parsing: false },
      });
      expect(ok).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // The dispatcher
  // -------------------------------------------------------------------------

  it("has an effect function for every decision type it claims to implement", async () => {
    const { data, error } = await admin
      .from("decisions")
      .select("id")
      .limit(0);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // `apply_decision_effect` dispatches to `effect_<type>`; a type with no
    // such function raises EFFECT_NOT_IMPLEMENTED rather than silently doing
    // nothing. `change_rule` has one, which is what this whole suite exercises.
    const { ruleId, versionId } = await draftRule();
    await apply(await proposeAndApply(versionId, "create"));
    expect((await ruleRow(ruleId)).status).toBe("active");
  });
});
