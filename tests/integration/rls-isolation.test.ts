import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// The app's own environment file, so the suite runs against whatever the app
// is pointed at rather than needing a second copy of the same three values.
config({ path: ".env.local", quiet: true });

/**
 * The phase-1 acceptance criterion that cannot be satisfied by inspection:
 *
 *   "A member of house A receives zero rows from house B for every table —
 *    proved by test, not by inspection."
 *
 * It runs against a real database, because RLS is a property of Postgres and
 * nothing else. Point it at a local stack or a scratch project — never at the
 * production one; it creates and deletes users.
 *
 *   npm run test -- tests/integration
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

const describeIfConfigured = configured ? describe : describe.skip;

interface Actor {
  userId: string;
  email: string;
  client: SupabaseClient;
  houseId: string;
  memberId: string;
}

const PASSWORD = "test-password-1";
const stamp = Date.now();

describeIfConfigured("cross-house isolation", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  let alice: Actor;
  let bob: Actor;

  async function makeActor(label: string, houseName: string): Promise<Actor> {
    const email = `${label}-${stamp}@houseos.test`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (createError) throw createError;

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    const { data: house, error: houseError } = await client.rpc("create_house", {
      p_name: houseName,
      p_address: null,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (houseError) throw houseError;

    const houseId = (house as { house_id: string }[])[0].house_id;

    const { data: member } = await client
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .single();

    // One room per house, so the room tables have something to leak if they can.
    await client
      .from("rooms")
      .insert({ house_id: houseId, name: "Front", capacity: 3, monthly_rent_paise: 900000 });

    return {
      userId: created.user!.id,
      email,
      client,
      houseId,
      memberId: (member as { id: string }).id,
    };
  }

  beforeAll(async () => {
    alice = await makeActor("alice", `Alice House ${stamp}`);
    bob = await makeActor("bob", `Bob House ${stamp}`);
  }, 60_000);

  afterAll(async () => {
    if (!configured) return;
    for (const actor of [alice, bob]) {
      if (!actor) continue;
      // Expenses reference members, which the house cascade would otherwise
      // trip over; clearing them first keeps teardown clean.
      await admin.from("expenses").delete().eq("house_id", actor.houseId);
      await admin.from("houses").delete().eq("id", actor.houseId);
      await admin.auth.admin.deleteUser(actor.userId);
    }
  }, 60_000);

  it("shows each member only their own house", async () => {
    const { data } = await alice.client.from("houses").select("id");
    expect(data?.map((row) => row.id)).toEqual([alice.houseId]);
  });

  // Every house-scoped table, phase by phase. A new table joins this list in
  // the same commit that creates it — that is the standing rule.
  const tables = [
    "houses",
    "house_settings",
    "rooms",
    "house_members",
    "room_assignments",
    "expense_categories",
    "monthly_periods",
    "expenses",
    "expense_splits",
    "recurring_expenses",
  ] as const;

  for (const table of tables) {
    it(`returns zero rows of another house's ${table}`, async () => {
      const column = table === "houses" ? "id" : "house_id";
      const { data, error } = await alice.client
        .from(table)
        .select("*")
        .eq(column, bob.houseId);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  }

  it("hides a housemate's profile from an unrelated user", async () => {
    const { data } = await alice.client.from("users").select("id").eq("id", bob.userId);
    expect(data).toEqual([]);
  });

  it("refuses a write into another house", async () => {
    const { error } = await alice.client
      .from("rooms")
      .insert({ house_id: bob.houseId, name: "Smuggled", capacity: 1, monthly_rent_paise: 0 });

    expect(error).not.toBeNull();
  });

  it("refuses to change another house's settings", async () => {
    const { data } = await alice.client
      .from("house_settings")
      .update({ penalty_rate_paise: 1 })
      .eq("house_id", bob.houseId)
      .select("house_id");

    expect(data ?? []).toEqual([]);
  });

  it("keeps a pending member out of house data (BR-003)", async () => {
    const { data: house } = await admin
      .from("houses")
      .select("invite_code")
      .eq("id", bob.houseId)
      .single();

    const { error: joinError } = await alice.client.rpc("join_house", {
      p_invite_code: (house as { invite_code: string }).invite_code,
    });
    expect(joinError).toBeNull();

    // Pending gets the house name for the waiting screen, and nothing else.
    const { data: rooms } = await alice.client
      .from("rooms")
      .select("id")
      .eq("house_id", bob.houseId);
    expect(rooms).toEqual([]);

    const { data: members } = await alice.client
      .from("house_members")
      .select("id")
      .eq("house_id", bob.houseId);
    expect(members?.map((row) => row.id)).not.toContain(bob.memberId);
  });

  it("seeds the default categories with a new house", async () => {
    const { data } = await alice.client
      .from("expense_categories")
      .select("name")
      .eq("house_id", alice.houseId);

    expect(data?.length).toBe(9);
    expect(data?.map((row) => row.name)).toContain("Groceries");
  });

  it("hides another house's categories entirely", async () => {
    const { data } = await alice.client
      .from("expense_categories")
      .select("id")
      .eq("house_id", bob.houseId);
    expect(data).toEqual([]);
  });

  it("refuses to log an expense into another house", async () => {
    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", bob.houseId)
      .limit(1)
      .single();

    const { data: period } = await admin
      .from("monthly_periods")
      .insert({ house_id: bob.houseId, period: "2026-08" })
      .select("id")
      .single();

    const { error } = await alice.client.from("expenses").insert({
      house_id: bob.houseId,
      period_id: (period as { id: string }).id,
      paid_by_member_id: bob.memberId,
      category_id: (category as { id: string }).id,
      amount_paise: 100,
      expense_date: "2026-08-23",
      created_by: bob.memberId,
    });

    expect(error).not.toBeNull();
  });

  it("refuses to demote the last admin (BR-001)", async () => {
    const { error } = await alice.client
      .from("house_members")
      .update({ role: "member" })
      .eq("id", alice.memberId);

    expect(error?.message ?? "").toContain("LAST_ADMIN");
  });
});
