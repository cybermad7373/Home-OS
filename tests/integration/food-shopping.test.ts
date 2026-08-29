import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 13 — the shopping list (docs/15-FOOD-SPEC.md section 13), in a real
 * Postgres. Exercises RLS directly rather than the route handlers: any house
 * member reads and checks off an item (it is shared, section 13), but only
 * the creator or a lead deletes one (migration 085's shopping_items_delete).
 *
 *   npm run test -- tests/integration/food-shopping
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
  const { error } = await admin.from("shopping_items").select("id").limit(1);
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

describeIfReady("shopping list — shared checklist, creator-or-lead deletes", () => {
  let lead: Actor;
  let arun: Actor;

  let houseId: string;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `shopping-${label}-${stamp}@houseos.test`;
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
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
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

    await actor.client.rpc("request_join", { p_token: (invite as { token: string }).token, p_message: null });

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
    const { data, error } = await leadBase.client.rpc("create_house", {
      p_name: `Shopping ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (data as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);
    lead = { ...leadBase, memberId: await memberIdOf(houseId, leadBase.userId) };

    const arunBase = await signUp("arun");
    arun = { ...arunBase, memberId: await join(arunBase, houseId) };
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  it("lets a member add an item with only a name", async () => {
    const { data, error } = await arun.client
      .from("shopping_items")
      .insert({ house_id: houseId, name: "Rice", created_by: arun.memberId })
      .select("id, name, checked_off")
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe("Rice");
    expect(data?.checked_off).toBe(false);
  });

  it("is visible to every house member, not only its creator", async () => {
    const { data, error } = await lead.client
      .from("shopping_items")
      .select("name")
      .eq("house_id", houseId)
      .eq("name", "Rice");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets any member check off an item someone else added", async () => {
    const { data: item } = await arun.client
      .from("shopping_items")
      .insert({ house_id: houseId, name: "Dal", created_by: arun.memberId })
      .select("id")
      .single();

    const { error } = await lead.client
      .from("shopping_items")
      .update({ checked_off: true, checked_off_by: lead.memberId, checked_off_at: new Date().toISOString() })
      .eq("id", (item as { id: string }).id);

    expect(error).toBeNull();

    const { data: after } = await admin
      .from("shopping_items")
      .select("checked_off, checked_off_by")
      .eq("id", (item as { id: string }).id)
      .single();
    expect(after?.checked_off).toBe(true);
    expect(after?.checked_off_by).toBe(lead.memberId);
  });

  it("refuses a delete from a member who neither created the item nor leads the house", async () => {
    const { data: item } = await lead.client
      .from("shopping_items")
      .insert({ house_id: houseId, name: "Onions", created_by: lead.memberId })
      .select("id")
      .single();

    const { error, count } = await arun.client
      .from("shopping_items")
      .delete({ count: "exact" })
      .eq("id", (item as { id: string }).id);

    expect(error).toBeNull();
    expect(count).toBe(0);

    const { data: stillThere } = await admin
      .from("shopping_items")
      .select("id")
      .eq("id", (item as { id: string }).id)
      .maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("lets its own creator delete it", async () => {
    const { data: item } = await arun.client
      .from("shopping_items")
      .insert({ house_id: houseId, name: "Tomatoes", created_by: arun.memberId })
      .select("id")
      .single();

    const { error, count } = await arun.client
      .from("shopping_items")
      .delete({ count: "exact" })
      .eq("id", (item as { id: string }).id);

    expect(error).toBeNull();
    expect(count).toBe(1);
  });
});
