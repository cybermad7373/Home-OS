import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * One person, two Homes.
 *
 * Every other suite gives each actor exactly one membership, which is why this
 * whole class of bug survived to 2026-09-03: three caller-facing write
 * functions resolved the Home for themselves through `current_member()` with no
 * house id, and that returns *an arbitrary one* of the caller's active
 * memberships — arbitrary in the strict sense, because members who joined on
 * the same day have no tiebreak at all.
 *
 * With one membership each it is unambiguous and everything passes. With two it
 * produced both halves of the failure: an admin refused in the Home they
 * administer, and — the one that matters, because it is silent — an expense
 * booked against a household that never spent the money.
 *
 * So the property under test is not "the functions work". It is that the Home
 * is the caller's to name and the database's to check, and that naming a Home
 * you do not belong to is refused rather than quietly redirected.
 *
 * It creates and deletes real users. Point it at a local or scratch project.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);
const describeIfConfigured = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();
const TODAY = new Date().toISOString().slice(0, 10);

describeIfConfigured("a member of two Homes", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  /** The person in both Homes: admin of the first, ordinary member of the second. */
  let ravi: SupabaseClient;
  let raviUserId: string;
  /** The admin of the second Home, who is in that one only. */
  let priya: SupabaseClient;

  let adminHouseId: string;
  let memberHouseId: string;
  let raviInAdminHouse: string;
  let raviInMemberHouse: string;
  let adminHouseCategory: string;
  let memberHouseCategory: string;

  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function makeUser(prefix: string) {
    const email = `${prefix}-${stamp}@houseos.dev`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: prefix },
    });
    if (error) throw error;

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    userIds.push(data.user!.id);
    return { id: data.user!.id, client };
  }

  async function categoryOf(houseId: string): Promise<string> {
    const { data } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1);
    return (data as { id: string }[])[0].id;
  }

  beforeAll(async () => {
    const first = await makeUser("mh-ravi");
    const second = await makeUser("mh-priya");
    ravi = first.client;
    raviUserId = first.id;
    priya = second.client;

    const { data: mine, error: mineError } = await ravi.rpc("create_house", {
      p_name: `Multi Home A ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
      p_type: "shared",
    });
    if (mineError) throw mineError;
    adminHouseId = (mine as { house_id: string }[])[0].house_id;
    houseIds.push(adminHouseId);

    const { data: theirs, error: theirsError } = await priya.rpc("create_house", {
      p_name: `Multi Home B ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
      p_type: "shared",
    });
    if (theirsError) throw theirsError;
    memberHouseId = (theirs as { house_id: string }[])[0].house_id;
    houseIds.push(memberHouseId);

    // Ravi joins the second Home as an ordinary member. Same joined_date as his
    // own membership in the first, which is exactly the tie that made the old
    // behaviour undefined rather than merely surprising.
    await admin.from("house_members").insert({
      house_id: memberHouseId,
      user_id: raviUserId,
      role: "member",
      status: "active",
    });

    const { data: members } = await admin
      .from("house_members")
      .select("id, house_id, user_id")
      .eq("user_id", raviUserId);
    const rows = members as { id: string; house_id: string }[];
    raviInAdminHouse = rows.find((row) => row.house_id === adminHouseId)!.id;
    raviInMemberHouse = rows.find((row) => row.house_id === memberHouseId)!.id;

    adminHouseCategory = await categoryOf(adminHouseId);
    memberHouseCategory = await categoryOf(memberHouseId);
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const houseId of houseIds) {
      await admin.from("monthly_periods").update({ status: "open" }).eq("house_id", houseId);
      await admin.from("houses").delete().eq("id", houseId);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 180_000);

  it("is a real two-Home membership, or the rest of this suite proves nothing", () => {
    expect(raviInAdminHouse).toBeTruthy();
    expect(raviInMemberHouse).toBeTruthy();
    expect(raviInAdminHouse).not.toEqual(raviInMemberHouse);
  });

  it("books an expense against the Home it names, not one of them", async () => {
    const { data, error } = await ravi.rpc("create_expense", {
      p_house_id: memberHouseId,
      p_category_id: memberHouseCategory,
      p_amount_paise: 12_345,
      p_expense_date: TODAY,
      p_split_basis: "equal",
      p_splits: [{ member_id: raviInMemberHouse, share_paise: 12_345 }],
      p_description: "Logged while standing in the other Home",
    });
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("expenses")
      .select("house_id, amount_paise")
      .eq("id", data as unknown as string)
      .single();

    expect((row as { house_id: string }).house_id).toEqual(memberHouseId);
  });

  it("refuses an expense in a Home the caller does not belong to", async () => {
    const outsiderHouse = adminHouseId;
    const { error } = await priya.rpc("create_expense", {
      p_house_id: outsiderHouse,
      p_category_id: adminHouseCategory,
      p_amount_paise: 100,
      p_expense_date: TODAY,
      p_split_basis: "equal",
      p_splits: [],
      p_description: "Should never land",
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toContain("NOT_HOUSE_MEMBER");
  });

  it("lets an admin publish a week in the Home they administer", async () => {
    const { data: template } = await admin
      .from("chore_templates")
      .select("id, effort_points, duration_min, slot")
      .eq("house_id", adminHouseId)
      .limit(1);
    const chore = (template as { id: string; effort_points: number; duration_min: number; slot: string }[])[0];

    const { data: runId, error } = await ravi.rpc("publish_schedule", {
      p_house_id: adminHouseId,
      p_week_start: TODAY,
      p_assignments: [
        {
          template_id: chore.id,
          assignee_member_id: raviInAdminHouse,
          chore_date: TODAY,
          slot: chore.slot,
          window_start: `${TODAY}T06:00:00Z`,
          window_end: `${TODAY}T23:00:00Z`,
          deadline: `${TODAY}T23:59:00Z`,
          effort_points: chore.effort_points,
          duration_min: chore.duration_min,
          status: "assigned",
        },
      ],
      p_generator: "admin",
      p_max_deviation: 0,
    });

    expect(error).toBeNull();

    const { data: run } = await admin
      .from("schedule_runs")
      .select("house_id")
      .eq("id", runId as unknown as string)
      .single();
    expect((run as { house_id: string }).house_id).toEqual(adminHouseId);
  });

  it("refuses to publish a week in a Home where the caller is only a member", async () => {
    const { error } = await ravi.rpc("publish_schedule", {
      p_house_id: memberHouseId,
      p_week_start: TODAY,
      p_assignments: [],
      p_generator: "admin",
      p_max_deviation: 0,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toContain("ADMIN_REQUIRED");

    const { count } = await admin
      .from("schedule_runs")
      .select("*", { count: "exact", head: true })
      .eq("house_id", memberHouseId);
    expect(count ?? 0).toEqual(0);
  });
});
