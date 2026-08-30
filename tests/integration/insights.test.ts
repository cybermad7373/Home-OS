import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  buildChoreInsights,
  buildFoodInsights,
  buildMoneyInsights,
  type InsightRange,
} from "@/lib/domain/insights";
import { computeBalances } from "@/lib/domain/settlement/netting";

config({ path: ".env.local", quiet: true });

/**
 * Phase 15 — the insights reads, against a real Postgres.
 *
 * The unit suite proves the arithmetic. This proves the **wiring**: that every
 * column, join and embedded relationship the repository names actually exists,
 * and that a member of another Home sees none of it.
 *
 * That distinction is the reason this file exists. Phase 15 arrived half
 * written against a schema nobody had — `chore_assignments.week_start`,
 * `meals.cost_paise`, a rating column on `meal_participants` — and every one of
 * those inventions typechecked as an error only because generated types
 * happened to be in the repository. A house without generated types would have
 * shipped it and found out in production.
 *
 * `lib/data/insights.ts` cannot be imported here: it is `server-only`. So the
 * queries below are the repository's queries, kept deliberately identical, and
 * their results are fed to the same pure builders the repository uses.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/insights
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

const describeIfReady = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();
const TODAY = new Date().toISOString().slice(0, 10);
const PERIOD = TODAY.slice(0, 7);

/** The whole calendar month, so a run on the 30th covers the 30th. */
function lastDayOfMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

const RANGE: InsightRange = {
  from: `${PERIOD}-01`,
  to: lastDayOfMonth(PERIOD),
  granularity: "month",
};

interface Actor {
  userId: string;
  memberId: string;
  client: SupabaseClient;
}

describeIfReady("insights reads", () => {
  let lead: Actor;
  let member: Actor;
  let outsider: Actor;

  let houseId: string;
  let categoryId: string;
  let pendingPaise = 0;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `insights-${label}-${stamp}@houseos.test`;
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

  /** One expense, split evenly, approved if the house asks for approval. */
  async function spend(amountPaise: number, description: string): Promise<string> {
    const members = [lead.memberId, member.memberId].sort();
    const base = Math.floor(amountPaise / members.length);
    const remainder = amountPaise - base * members.length;

    const { data, error } = await lead.client.rpc("create_expense", {
      p_category_id: categoryId,
      p_amount_paise: amountPaise,
      p_expense_date: TODAY,
      p_split_basis: "equal",
      p_splits: members.map((memberId, index) => ({
        member_id: memberId,
        share_paise: base + (index < remainder ? 1 : 0),
        guest_share_paise: 0,
      })),
      p_description: description,
      p_paid_by_member_id: lead.memberId,
    });
    if (error) throw error;
    return data as unknown as string;
  }

  async function approve(expenseId: string): Promise<void> {
    const { data: row } = await admin
      .from("expenses")
      .select("status")
      .eq("id", expenseId)
      .single();
    if ((row as { status: string }).status === "approved") return;

    const { error } = await member.client.rpc("approve_expense", {
      p_expense_id: expenseId,
      p_note: null,
    });
    if (error) throw error;
  }

  beforeAll(async () => {
    const leadBase = await signUp("lead");
    const { data, error } = await leadBase.client.rpc("create_house", {
      p_name: `Insights ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (data as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);
    lead = { ...leadBase, memberId: await memberIdOf(houseId, leadBase.userId) };

    const memberBase = await signUp("member");
    member = { ...memberBase, memberId: await join(memberBase, houseId) };

    const outsiderBase = await signUp("outsider");
    const { data: otherHouse, error: otherError } = await outsiderBase.client.rpc("create_house", {
      p_name: `Elsewhere ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (otherError) throw otherError;
    const otherHouseId = (otherHouse as { house_id: string }[])[0].house_id;
    houseIds.push(otherHouseId);
    outsider = {
      ...outsiderBase,
      memberId: await memberIdOf(otherHouseId, outsiderBase.userId),
    };

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();
    categoryId = (category as { id: string }).id;

    const approved = await spend(40_000, "Groceries");
    await approve(approved);

    // Left pending on purpose: the money view must report it separately and
    // count it in nobody's position. It has to clear the house's approval
    // threshold to stay pending — anything under it approves on creation.
    const { data: settings } = await admin
      .from("house_settings")
      .select("expense_approval_threshold_paise")
      .eq("house_id", houseId)
      .single();
    const threshold = (settings as { expense_approval_threshold_paise: number })
      .expense_approval_threshold_paise;
    pendingPaise = threshold + 90_000;
    await spend(pendingPaise, "Still waiting");

    const { error: mealError } = await lead.client.rpc("create_meal", {
      p_house_id: houseId,
      p_name: "Dosa",
      p_meal_date: TODAY,
      p_source: "home_cooked",
      p_base_cost_paise: 12_000,
      p_shares: [
        { member_id: lead.memberId, share_paise: 6_000 },
        { member_id: member.memberId, share_paise: 6_000 },
      ],
    });
    if (mealError) throw mealError;
  });

  afterAll(async () => {
    if (!configured) return;
    for (const house of houseIds) await admin.from("houses").delete().eq("id", house);
    for (const user of userIds) await admin.auth.admin.deleteUser(user);
  });

  // --- the repository's own queries, run as a real member -------------------

  async function readMoney(client: SupabaseClient) {
    const expenses = await client
      .from("expenses")
      .select(
        `id, expense_date, amount_paise, status, category_id, paid_by_member_id,
         expense_categories ( name ),
         payer:house_members!expenses_paid_by_member_id_fkey (
           display_name, users ( display_name )
         )`,
      )
      .eq("house_id", houseId)
      .is("reserve_id", null)
      .neq("status", "void")
      .gte("expense_date", RANGE.from)
      .lte("expense_date", RANGE.to);

    const splits = await client
      .from("expense_splits")
      .select(
        "expense_id, member_id, share_paise, guest_share_paise, dependent_share_paise, expenses!inner(expense_date)",
      )
      .eq("house_id", houseId)
      .gte("expenses.expense_date", RANGE.from)
      .lte("expenses.expense_date", RANGE.to);

    const members = await client
      .from("house_members")
      .select("id, status, display_name, users(display_name)")
      .eq("house_id", houseId);

    return { expenses, splits, members };
  }

  it("reads every column and join the money view names", async () => {
    const { expenses, splits, members } = await readMoney(lead.client);

    expect(expenses.error).toBeNull();
    expect(splits.error).toBeNull();
    expect(members.error).toBeNull();
    expect(expenses.data?.length).toBe(2);
  });

  it("counts the approved expense and reports the pending one separately", async () => {
    const { expenses, splits, members } = await readMoney(lead.client);

    type Row = {
      id: string;
      expense_date: string;
      amount_paise: number;
      status: string;
      category_id: string;
      paid_by_member_id: string;
      expense_categories: { name: string } | null;
      payer: { display_name: string | null; users: { display_name: string } | null } | null;
    };

    const report = buildMoneyInsights({
      range: RANGE,
      isPot: false,
      expenses: ((expenses.data ?? []) as unknown as Row[]).map((row) => ({
        expenseId: row.id,
        date: row.expense_date,
        amountPaise: row.amount_paise,
        categoryId: row.category_id,
        categoryName: row.expense_categories?.name ?? "Uncategorised",
        paidByMemberId: row.paid_by_member_id,
        paidByName: row.payer?.display_name ?? row.payer?.users?.display_name ?? "Someone",
        approved: row.status === "approved",
      })),
      splits: (splits.data ?? []).map((split) => ({
        expenseId: split.expense_id,
        memberId: split.member_id,
        sharePaise: split.share_paise,
        guestSharePaise: split.guest_share_paise,
        dependentSharePaise: split.dependent_share_paise,
      })),
      members: (
        (members.data ?? []) as unknown as {
          id: string;
          status: string;
          display_name: string | null;
          users: { display_name: string } | null;
        }[]
      ).map((row) => ({
        memberId: row.id,
        displayName: row.display_name ?? row.users?.display_name ?? "Someone",
        active: row.status === "active",
      })),
    });

    expect(report.totalPaise).toBe(40_000);
    expect(report.pendingPaise).toBe(pendingPaise);

    // The payer paid 40,000 and owes 20,000 of it.
    const payer = report.paidVsShare.find((row) => row.memberId === lead.memberId);
    expect(payer?.paidPaise).toBe(40_000);
    expect(payer?.fairSharePaise).toBe(20_000);
    expect(payer?.netPaise).toBe(20_000);

    // IN-09's criterion, on real rows: the position equals the settlement's own
    // expense_net for every member.
    for (const balance of computeBalances(
      report.paidVsShare.map((row) => ({
        memberId: row.memberId,
        paidPaise: row.paidPaise,
        fairSharePaise: row.fairSharePaise,
      })),
    )) {
      const row = report.paidVsShare.find((candidate) => candidate.memberId === balance.memberId);
      expect(row?.netPaise).toBe(balance.expenseNetPaise);
    }
  });

  it("reads every column and join the chores view names", async () => {
    const { data, error } = await lead.client
      .from("chore_assignments")
      .select(
        `id, chore_date, assignee_member_id, effort_points, status,
         chore_templates ( name ),
         assignee:house_members!chore_assignments_assignee_member_id_fkey (
           display_name, users ( display_name )
         )`,
      )
      .eq("house_id", houseId)
      .gte("chore_date", RANGE.from)
      .lte("chore_date", RANGE.to);

    expect(error).toBeNull();

    // A house with no published schedule has no assignments, and the builder
    // must survive that rather than dividing by it.
    const report = buildChoreInsights({
      range: RANGE,
      members: [],
      isFamily: false,
      assignments: (data ?? []).map((row) => ({
        assignmentId: row.id,
        choreDate: row.chore_date,
        memberId: row.assignee_member_id,
        memberName: "Someone",
        templateName: "Chore",
        points: row.effort_points,
        status: row.status,
      })),
    });

    expect(report.summary.confirmedPoints).toBeGreaterThanOrEqual(0);
  });

  it("reads every column and join the food view names", async () => {
    const meals = await lead.client
      .from("meals")
      .select("id, meal_date, name, source, total_cost_paise, foods ( normalised_name )")
      .eq("house_id", houseId)
      .gte("meal_date", RANGE.from)
      .lte("meal_date", RANGE.to);

    const participants = await lead.client
      .from("meal_participants")
      .select("meal_id, member_id, meals!inner(meal_date)")
      .eq("house_id", houseId)
      .gte("meals.meal_date", RANGE.from)
      .lte("meals.meal_date", RANGE.to);

    const preferences = await lead.client
      .from("food_preferences")
      .select("member_id, rating, item_name, foods ( name, normalised_name )")
      .eq("house_id", houseId);

    expect(meals.error).toBeNull();
    expect(participants.error).toBeNull();
    expect(preferences.error).toBeNull();

    type MealRow = {
      id: string;
      meal_date: string;
      name: string;
      source: string;
      total_cost_paise: number;
    };

    const report = buildFoodInsights({
      range: RANGE,
      opinions: [],
      meals: ((meals.data ?? []) as unknown as MealRow[]).map((row) => ({
        mealId: row.id,
        date: row.meal_date,
        name: row.name,
        normalisedName: row.name.trim().toLowerCase(),
        source: row.source as "home_cooked",
        costPaise: row.total_cost_paise,
        participantMemberIds: (participants.data ?? [])
          .filter((participant) => participant.meal_id === row.id && participant.member_id)
          .map((participant) => participant.member_id as string),
      })),
    });

    expect(report.homeCookedMeals).toBe(1);
    expect(report.homeCookedPaise).toBe(12_000);
    expect(report.outsidePaise).toBe(0);
  });

  it("reads the columns the position needs", async () => {
    const expected = await lead.client
      .from("member_expected_contributions")
      .select("member_id, amount_paise, effective_from, effective_to")
      .eq("house_id", houseId);

    const movements = await lead.client
      .from("reserve_movements")
      .select("created_at, kind, amount_paise, note, reserves!inner(active)")
      .eq("house_id", houseId);

    expect(expected.error).toBeNull();
    expect(movements.error).toBeNull();
  });

  it("reads the columns the full-history export needs", async () => {
    const decisions = await lead.client
      .from("decisions")
      .select("created_at, type, level, status, requested_by")
      .eq("house_id", houseId);

    const meals = await lead.client
      .from("meals")
      .select("meal_date, name, source, total_cost_paise, meal_type")
      .eq("house_id", houseId);

    expect(decisions.error).toBeNull();
    expect(meals.error).toBeNull();
  });

  it("shows a member of another Home nothing at all", async () => {
    const { expenses, splits, members } = await readMoney(outsider.client);

    // RLS, not a filter in the repository. An insights screen that leaked would
    // leak the whole Home's money in one request.
    expect(expenses.error).toBeNull();
    expect(expenses.data).toEqual([]);
    expect(splits.data).toEqual([]);
    expect(members.data).toEqual([]);

    const meals = await outsider.client
      .from("meals")
      .select("id")
      .eq("house_id", houseId);
    expect(meals.data).toEqual([]);
  });
});
