import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Correcting a recorded meal (S-45), against a real Postgres.
 *
 * The food phase shipped with no way to open a meal again, so nothing had ever
 * exercised `meals_update`. The policy has been there since migration 085 and
 * says the creator or a lead may edit; this is the first thing to hold it to
 * that, and to the two invariants around it: the total is the database's to
 * compute from the four components, and a meal in another house is invisible
 * rather than merely unwritable.
 *
 *   npm run test -- tests/integration/meal-edit
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
  const { error } = await admin.from("meals").select("id").limit(1);
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

describeIfReady("editing a meal — creator or lead, and the total stays derived", () => {
  let lead: Actor;
  let arun: Actor;
  let outsider: Actor;

  let houseId: string;
  let otherHouseId: string;
  let mealId: string;

  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `mealedit-${label}-${stamp}@houseos.test`;
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
    houseId = await createHouse(leadBase, `Meal Edit ${stamp}`);
    lead = { ...leadBase, memberId: await memberIdOf(houseId, leadBase.userId) };

    const arunBase = await signUp("arun");
    arun = { ...arunBase, memberId: await join(arunBase, houseId) };

    const outsiderBase = await signUp("outsider");
    otherHouseId = await createHouse(outsiderBase, `Other ${stamp}`);
    outsider = { ...outsiderBase, memberId: await memberIdOf(otherHouseId, outsiderBase.userId) };

    // Arun records the meal, so he is its creator and the lead is not.
    const { data, error } = await arun.client
      .from("meals")
      .insert({
        house_id: houseId,
        name: "Paruppu Sadham",
        meal_date: new Date().toISOString().slice(0, 10),
        source: "home_cooked",
        base_cost_paise: 15_000,
        prep_cost_paise: 0,
        delivery_cost_paise: 0,
        other_cost_paise: 0,
        created_by: arun.memberId,
      })
      .select("id")
      .single();
    if (error) throw error;
    mealId = (data as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  it("lets the member who recorded it correct a mistyped amount", async () => {
    const { error } = await arun.client
      .from("meals")
      .update({ base_cost_paise: 18_000 })
      .eq("id", mealId);
    expect(error).toBeNull();

    const { data } = await admin
      .from("meals")
      .select("base_cost_paise")
      .eq("id", mealId)
      .single();
    expect((data as { base_cost_paise: number }).base_cost_paise).toBe(18_000);
  });

  it("recomputes the total from the four components rather than trusting a caller", async () => {
    // The point of not sending a total: a caller cannot state one that
    // disagrees with its own parts.
    await arun.client
      .from("meals")
      .update({
        base_cost_paise: 20_000,
        prep_cost_paise: 3_000,
        delivery_cost_paise: 2_000,
        other_cost_paise: 1_000,
      })
      .eq("id", mealId);

    const { data } = await admin
      .from("meals")
      .select("total_cost_paise")
      .eq("id", mealId)
      .single();
    expect((data as { total_cost_paise: number }).total_cost_paise).toBe(26_000);
  });

  it("lets a lead correct a meal somebody else recorded", async () => {
    const { error } = await lead.client
      .from("meals")
      .update({ note: "Corrected by the lead" })
      .eq("id", mealId);
    expect(error).toBeNull();

    const { data } = await admin.from("meals").select("note").eq("id", mealId).single();
    expect((data as { note: string }).note).toBe("Corrected by the lead");
  });

  it("clears a note when it is set to null, rather than leaving the old one", async () => {
    // `null` is a value and `undefined` is an absence — the distinction the
    // update builder exists to preserve.
    await arun.client.from("meals").update({ note: null }).eq("id", mealId);

    const { data } = await admin.from("meals").select("note").eq("id", mealId).single();
    expect((data as { note: string | null }).note).toBeNull();
  });

  it("keeps a meal in one house invisible to a member of another", async () => {
    const { data } = await outsider.client.from("meals").select("id").eq("id", mealId);
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses an edit from a member of another house, and changes nothing", async () => {
    await outsider.client.from("meals").update({ name: "Stolen" }).eq("id", mealId);

    const { data } = await admin.from("meals").select("name").eq("id", mealId).single();
    expect((data as { name: string }).name).toBe("Paruppu Sadham");
  });

  it("lets the creator delete it, and the row is gone", async () => {
    const { error } = await arun.client.from("meals").delete().eq("id", mealId);
    expect(error).toBeNull();

    const { data } = await admin.from("meals").select("id").eq("id", mealId);
    expect(data ?? []).toHaveLength(0);
  });
});
