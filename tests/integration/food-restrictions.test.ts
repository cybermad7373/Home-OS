import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 13 — food restrictions, in a real Postgres.
 *
 * A dislike is a weight in the recommendation score. A restriction is not, and
 * the difference is the whole point of migration 082 (D-63). This suite covers
 * the half only a database can be asked about:
 *
 *   * an allergen is refused **when the caller holds the service-role key**,
 *     because a trigger is the only version of BR-221 worth having — a check in
 *     a route handler is bypassed by the first maintenance script;
 *   * intolerance and diet do not block, because they are not medical events
 *     and a record of something that actually happened should not be refusable;
 *   * a restriction is readable by the person it describes and by nobody else,
 *     including a lead of their own Home (BR-226);
 *   * `foods_safe_for` filters, and returns the restriction to no one.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/food-restrictions
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
 * Migration 082 may not be applied to whatever this run is pointed at. That is
 * a state of the environment rather than a defect, so the suite skips rather
 * than reporting a failure it cannot tell apart from a missing migration — the
 * same shape `rules.test.ts` uses for 066.
 */
let migrated = false;
if (configured) {
  const { error } = await admin.from("member_restrictions").select("id").limit(1);
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

describeIfReady("food restrictions — the exclusion no score outranks", () => {
  let lead: Actor;
  let arun: Actor;

  let houseId: string;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  let peanutFoodId: string;
  let safeFoodId: string;

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `restrict-${label}-${stamp}@houseos.test`;
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

  async function join(actor: Omit<Actor, "memberId">, house: string): Promise<string> {
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

    return memberIdOf(house, actor.userId);
  }

  /**
   * A meal built the way the database will see one: the row, its items, its
   * participants. Written with the service-role key on purpose — the assertion
   * is that the trigger holds against a caller who is past RLS entirely.
   */
  async function recordMeal(input: {
    name: string;
    items: string[];
    participants: string[];
    foodId?: string;
  }) {
    const { data: meal, error } = await admin
      .from("meals")
      .insert({
        house_id: houseId,
        name: input.name,
        food_id: input.foodId ?? null,
        cost_paise: 0,
        meal_date: "2026-08-28",
        created_by_member_id: lead.memberId,
      })
      .select("id")
      .single();
    if (error) throw error;
    const mealId = (meal as { id: string }).id;

    const itemsResult = await admin
      .from("meal_items")
      .insert(input.items.map((name) => ({ meal_id: mealId, name })));

    const participantsResult = await admin
      .from("meal_participants")
      .insert(input.participants.map((member_id) => ({ meal_id: mealId, member_id })));

    return { mealId, itemsResult, participantsResult };
  }

  beforeAll(async () => {
    const leadBase = await signUp("lead");
    const { data, error } = await leadBase.client.rpc("create_house", {
      p_name: `Restrictions ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (data as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);
    lead = { ...leadBase, memberId: await memberIdOf(houseId, leadBase.userId) };

    const arunBase = await signUp("arun");
    arun = { ...arunBase, memberId: await join(arunBase, houseId) };

    const { data: foods, error: foodError } = await admin
      .from("foods")
      .insert([
        { house_id: houseId, name: "Peanut Chutney", canonical_name: "peanut chutney" },
        { house_id: houseId, name: "Curd Rice", canonical_name: "curd rice" },
      ])
      .select("id, name");
    if (foodError) throw foodError;
    const rows = foods as { id: string; name: string }[];
    peanutFoodId = rows.find((r) => r.name === "Peanut Chutney")!.id;
    safeFoodId = rows.find((r) => r.name === "Curd Rice")!.id;

    const { error: restrictionError } = await arun.client
      .from("member_restrictions")
      .insert({
        house_id: houseId,
        member_id: arun.memberId,
        item_name: "Peanut",
        severity: "allergy",
      });
    if (restrictionError) throw restrictionError;
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // BR-221 — the allergen refusal, against the service-role key
  // -------------------------------------------------------------------------

  it("refuses to record an allergen against the member it belongs to", async () => {
    const { participantsResult } = await recordMeal({
      name: "Idli with peanut chutney",
      items: ["Idli", "Peanut chutney"],
      participants: [arun.memberId],
    });

    expect(participantsResult.error).not.toBeNull();
    expect(participantsResult.error?.message).toContain("FOOD_RESTRICTION_VIOLATION");
  });

  it("refuses from the other side too — adding the item to a meal they are already on", async () => {
    const { mealId, participantsResult } = await recordMeal({
      name: "Idli",
      items: ["Idli"],
      participants: [arun.memberId],
    });
    expect(participantsResult.error).toBeNull();

    const { error } = await admin
      .from("meal_items")
      .insert({ meal_id: mealId, name: "Peanut oil" });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("FOOD_RESTRICTION_VIOLATION");
  });

  it("records the same meal for everyone else", async () => {
    const { participantsResult } = await recordMeal({
      name: "Peanut chutney, without Arun",
      items: ["Idli", "Peanut chutney"],
      participants: [lead.memberId],
    });

    expect(participantsResult.error).toBeNull();
  });

  it("matches on containment, not equality — 'peanut' catches 'peanut oil'", async () => {
    const { participantsResult } = await recordMeal({
      name: "Fried rice",
      items: ["Rice", "Peanut oil"],
      participants: [arun.memberId],
    });

    expect(participantsResult.error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // BR-222 — the two severities that warn rather than block
  // -------------------------------------------------------------------------

  it("does not block a diet-severity item, because a record of what happened is not refusable", async () => {
    await arun.client.from("member_restrictions").insert({
      house_id: houseId,
      member_id: arun.memberId,
      item_name: "Onion",
      severity: "diet",
    });

    const { participantsResult } = await recordMeal({
      name: "Onion sambar",
      items: ["Onion", "Toor dal"],
      participants: [arun.memberId],
    });

    expect(participantsResult.error).toBeNull();

    const { data } = await admin.rpc("meal_restriction_conflicts", {
      p_meal_id: (
        await admin
          .from("meals")
          .select("id")
          .eq("house_id", houseId)
          .eq("name", "Onion sambar")
          .single()
      ).data!.id,
    });

    // It saved, and it is still reported as a conflict — which is what lets the
    // form warn without refusing.
    expect((data as { severity: string }[]).some((c) => c.severity === "diet")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // BR-226 — a restriction is health information about one person
  // -------------------------------------------------------------------------

  it("hides a member's restrictions from the lead of their own Home", async () => {
    const { data } = await lead.client
      .from("member_restrictions")
      .select("id")
      .eq("member_id", arun.memberId);

    expect(data ?? []).toEqual([]);
  });

  it("shows a member their own", async () => {
    const { data, error } = await arun.client
      .from("member_restrictions")
      .select("item_name, severity")
      .eq("member_id", arun.memberId);

    expect(error).toBeNull();
    expect((data as { item_name: string }[]).map((r) => r.item_name).sort()).toEqual([
      "Onion",
      "Peanut",
    ]);
  });

  it("refuses to let one member write a restriction onto another", async () => {
    const { error } = await lead.client.from("member_restrictions").insert({
      house_id: houseId,
      member_id: arun.memberId,
      item_name: "Coriander",
      severity: "diet",
    });

    expect(error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // BR-219 / BR-220 — the filter, and what it returns to whom
  // -------------------------------------------------------------------------

  it("filters the candidate set and returns no restriction with it", async () => {
    const { data, error } = await admin.rpc("foods_safe_for", {
      p_house_id: houseId,
      p_member_ids: [arun.memberId],
    });

    expect(error).toBeNull();
    const ids = (data as { food_id: string }[]).map((r) => r.food_id);
    expect(ids).toContain(safeFoodId);
    expect(ids).not.toContain(peanutFoodId);
  });

  it("is a union across everyone being served, not an intersection", async () => {
    const { data } = await admin.rpc("foods_safe_for", {
      p_house_id: houseId,
      p_member_ids: [lead.memberId, arun.memberId],
    });

    const ids = (data as { food_id: string }[]).map((r) => r.food_id);
    // Safe for the lead alone, unsafe for Arun, therefore unsafe for the meal.
    expect(ids).not.toContain(peanutFoodId);
  });

  it("normalises on the way in, so casing and punctuation cannot smuggle a duplicate past the unique index", async () => {
    const { error } = await arun.client.from("member_restrictions").insert({
      house_id: houseId,
      member_id: arun.memberId,
      item_name: "  PEA-NUT  ",
      severity: "allergy",
    });

    // "  PEA-NUT  " canonicalises to "pea nut", which is a different item from
    // "peanut" and is allowed. The assertion is that it stored, canonicalised.
    expect(error).toBeNull();

    const { data } = await arun.client
      .from("member_restrictions")
      .select("canonical_item")
      .eq("item_name", "  PEA-NUT  ")
      .single();

    expect((data as { canonical_item: string }).canonical_item).toBe("pea nut");
  });

  /**
   * Stated as a test rather than left as a surprise. The matcher is textual
   * containment on the canonical form; it knows nothing about synonyms, so a
   * member restricted from "peanut" is **not** protected from an item somebody
   * recorded as "groundnut". This is a documented limit of the feature
   * (15-FOOD-SPEC.md 5.2a), and the mitigation is that the restriction entry
   * screen offers known aliases rather than that the matcher guesses. If a
   * synonym table is ever added, this test is the one that should change.
   */
  it("does not match synonyms — 'groundnut' is not 'peanut'", async () => {
    const { participantsResult } = await recordMeal({
      name: "Groundnut chutney",
      items: ["Groundnut chutney"],
      participants: [arun.memberId],
    });

    expect(participantsResult.error).toBeNull();
  });

  it("refuses a blank item", async () => {
    const { error } = await arun.client.from("member_restrictions").insert({
      house_id: houseId,
      member_id: arun.memberId,
      item_name: "   ",
      severity: "diet",
    });

    expect(error).not.toBeNull();
  });
});
