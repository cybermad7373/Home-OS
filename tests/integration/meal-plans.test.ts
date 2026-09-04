import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Planned meals (docs/15-FOOD-SPEC.md section 11, FD-20 and BR-217), against a
 * real Postgres.
 *
 * PROGRESS.md carried this as a gap: the plan lifecycle had no test below the
 * end-to-end steps, so `meal_plans` RLS had never been held to its own policy
 * and the rule the feature exists to keep had never been checked at all.
 *
 * That rule is BR-217, and it is the reason a plan is a separate table rather
 * than a meal with a flag: **until it is confirmed, a plan creates no cost, no
 * expense, no participants and no preference signal, and appears in no history
 * or Insights view.** A plan is an intention. The failure it guards against is
 * a household being told it spent money on a dinner it only talked about.
 *
 *   npm run test -- tests/integration/meal-plans
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

let migrated = false;
if (configured) {
  const { error } = await admin.from("meal_plans").select("id").limit(1);
  migrated = !error;
}

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();
const TODAY = new Date().toISOString().slice(0, 10);

interface Actor {
  userId: string;
  memberId: string;
  client: SupabaseClient;
}

describeIfReady("planned meals — an intention until somebody confirms it", () => {
  let lead: Actor;
  let arun: Actor;
  let outsider: Actor;

  let houseId: string;
  let otherHouseId: string;
  let planId: string;

  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `mealplan-${label}-${stamp}@houseos.test`;
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

  async function createHouse(actor: Omit<Actor, "memberId">, name: string): Promise<string> {
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

    await lead.client.rpc("accept_join_request", { p_request_id: (request as { id: string }).id });

    return memberIdOf(house, actor.userId);
  }

  beforeAll(async () => {
    const leadBase = await signUp("lead");
    houseId = await createHouse(leadBase, `Meal Plan ${stamp}`);
    lead = { ...leadBase, memberId: await memberIdOf(houseId, leadBase.userId) };

    const arunBase = await signUp("arun");
    arun = { ...arunBase, memberId: await join(arunBase, houseId) };

    const outsiderBase = await signUp("outsider");
    otherHouseId = await createHouse(outsiderBase, `Other Plan ${stamp}`);
    outsider = { ...outsiderBase, memberId: await memberIdOf(otherHouseId, outsiderBase.userId) };
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  it("lets any member plan a meal, with nothing but a name and a date", async () => {
    const { data, error } = await arun.client
      .from("meal_plans")
      .insert({
        house_id: houseId,
        name: "Paruppu Sadham",
        planned_date: TODAY,
        created_by: arun.memberId,
      })
      .select("id, confirmed_meal_id")
      .single();

    expect(error).toBeNull();
    planId = (data as { id: string }).id;
    // The whole of BR-217 in one field: a fresh plan points at no meal.
    expect((data as { confirmed_meal_id: string | null }).confirmed_meal_id).toBeNull();
  });

  it("creates no meal, no expense and no participants — BR-217", async () => {
    // The rule the table exists for. A plan is an intention, and a household
    // must never be told it spent money on a dinner it only talked about.
    for (const table of ["meals", "expenses", "meal_participants"] as const) {
      const { data } = await admin.from(table).select("id").eq("house_id", houseId);
      expect(data ?? [], `${table} should be empty while the plan is unconfirmed`).toHaveLength(0);
    }
  });

  it("is visible to the whole house, not only to whoever planned it", async () => {
    const { data } = await lead.client.from("meal_plans").select("id").eq("id", planId);
    expect(data ?? []).toHaveLength(1);
  });

  it("refuses a plan filed under somebody else's name", async () => {
    // `meal_plans_insert` checks `created_by = current_member(house_id).id`.
    const { error } = await arun.client.from("meal_plans").insert({
      house_id: houseId,
      name: "Not mine to file",
      planned_date: TODAY,
      created_by: lead.memberId,
    });
    expect(error).not.toBeNull();
  });

  it("keeps a plan in one house invisible to a member of another", async () => {
    const { data } = await outsider.client.from("meal_plans").select("id").eq("id", planId);
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses an edit from a member of another house, and changes nothing", async () => {
    await outsider.client.from("meal_plans").update({ name: "Stolen" }).eq("id", planId);

    const { data } = await admin.from("meal_plans").select("name").eq("id", planId).single();
    expect((data as { name: string }).name).toBe("Paruppu Sadham");
  });

  it("becomes evidence only when it is confirmed, and points at the meal it became", async () => {
    // Confirming is what turns the intention into a record: a meal exists from
    // here, and the plan carries the link so the same plan cannot become two.
    const { data: meal, error: mealError } = await arun.client
      .from("meals")
      .insert({
        house_id: houseId,
        name: "Paruppu Sadham",
        meal_date: TODAY,
        source: "home_cooked",
        base_cost_paise: 15_000,
        created_by: arun.memberId,
      })
      .select("id")
      .single();
    expect(mealError).toBeNull();
    const mealId = (meal as { id: string }).id;

    const { error } = await arun.client
      .from("meal_plans")
      .update({ confirmed_meal_id: mealId })
      .eq("id", planId);
    expect(error).toBeNull();

    const { data } = await admin
      .from("meal_plans")
      .select("confirmed_meal_id")
      .eq("id", planId)
      .single();
    expect((data as { confirmed_meal_id: string }).confirmed_meal_id).toBe(mealId);
  });

  it("keeps the meal when the plan is deleted — the record outlives the intention", async () => {
    const { data: before } = await admin
      .from("meal_plans")
      .select("confirmed_meal_id")
      .eq("id", planId)
      .single();
    const mealId = (before as { confirmed_meal_id: string }).confirmed_meal_id;

    const { error } = await arun.client.from("meal_plans").delete().eq("id", planId);
    expect(error).toBeNull();

    const { data: meal } = await admin.from("meals").select("id").eq("id", mealId);
    expect(meal ?? [], "deleting a plan must not delete the meal it became").toHaveLength(1);
  });

  it("refuses a delete from a member who neither planned it nor leads the house", async () => {
    const { data: created } = await lead.client
      .from("meal_plans")
      .insert({
        house_id: houseId,
        name: "The lead's plan",
        planned_date: TODAY,
        created_by: lead.memberId,
      })
      .select("id")
      .single();
    const leadPlanId = (created as { id: string }).id;

    // Arun is an ordinary member and did not file it.
    await arun.client.from("meal_plans").delete().eq("id", leadPlanId);
    const { data: still } = await admin.from("meal_plans").select("id").eq("id", leadPlanId);
    expect(still ?? []).toHaveLength(1);

    // The lead may, because they filed it.
    const { error } = await lead.client.from("meal_plans").delete().eq("id", leadPlanId);
    expect(error).toBeNull();
  });
});
