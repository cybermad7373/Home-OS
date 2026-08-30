import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import {
  buildChoreInsights,
  buildFinancialPosition,
  buildFoodInsights,
  buildHomeInsights,
  buildMoneyInsights,
  earnedComponents,
  explainPoints,
  type ChoreInsightsOutput,
  type FinancialPositionOutput,
  type FoodInsightsOutput,
  type Granularity,
  type HomeInsightsOutput,
  type InsightRange,
  type InsightType,
  type MoneyInsightsOutput,
  type PointBreakdown,
  type PointComponent,
} from "@/lib/domain/insights";
import { endOfMonth } from "./expenses";
import { getPeriodPosition } from "./settlement";
import { houseToday } from "@/lib/utils/date";
import type { Session } from "./house";
import type { HouseContext } from "@/lib/types/domain";

/**
 * The insights repository (IN-01 to IN-10).
 *
 * It reads the facts, hands them to the pure builders in lib/domain/insights,
 * and returns what comes back. No arithmetic happens in this file.
 *
 * One entry point — `getInsights` — serves both `/insights` and
 * `GET /api/insights`, the same arrangement Today uses. A screen and its
 * endpoint that compose their own reads separately are a screen and an
 * endpoint that will eventually disagree about the same month.
 *
 * RLS does the authorisation. Every query here runs as the caller, so a member
 * of another Home reads nothing rather than reading a filtered nothing.
 */

export interface InsightsQuery {
  type: InsightType;
  /** `YYYY-MM`. Defaults to the month the house is currently in. */
  period?: string;
  granularity?: Granularity;
  /** How many months the range spans, ending with `period`. */
  months?: number;
  categoryId?: string;
  memberId?: string;
}

export type InsightsResult =
  | { type: "money"; range: InsightRange; money: MoneyInsightsOutput }
  | { type: "chores"; range: InsightRange; chores: ChoreInsightsOutput }
  | { type: "food"; range: InsightRange; food: FoodInsightsOutput }
  | { type: "home"; range: InsightRange; home: HomeInsightsOutput };

const MAX_MONTHS = 12;

/**
 * Resolves the query into a concrete date range in the house's timezone.
 *
 * The window is anchored on whole months even when the buckets are days or
 * weeks, so "August, by week" and "August, by month" cover exactly the same
 * spending and the two views cannot report different totals.
 */
export function resolveRange(house: { timezone: string }, query: InsightsQuery): InsightRange {
  const period = query.period ?? houseToday(house.timezone).slice(0, 7);
  const granularity = query.granularity ?? "week";
  const months = Math.min(MAX_MONTHS, Math.max(1, Math.trunc(query.months ?? 1)));

  const [year, month] = period.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 - (months - 1), 1));
  const from = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-01`;

  return { from, to: endOfMonth(period), granularity };
}

/** The one read every insights caller goes through. */
export async function getInsights(
  session: Session,
  context: HouseContext,
  query: InsightsQuery,
): Promise<InsightsResult> {
  const range = resolveRange(context.house, query);

  switch (query.type) {
    case "money":
      return { type: "money", range, money: await getMoneyInsights(session, context, query, range) };
    case "chores":
      return {
        type: "chores",
        range,
        chores: await getChoreInsights(session, context, query, range),
      };
    case "food":
      return { type: "food", range, food: await getFoodInsights(session, context, query, range) };
    case "home":
      return { type: "home", range, home: await getHomeInsights(session, context, range) };
  }
}

type MemberRow = {
  id: string;
  status: string;
  display_name: string | null;
  users: { display_name: string } | null;
};

async function readMembers(session: Session, houseId: string) {
  const { data, error } = await session.supabase
    .from("house_members")
    .select("id, status, display_name, users(display_name)")
    .eq("house_id", houseId);

  if (error) throw apiErrorFromPostgres(error);

  return ((data ?? []) as unknown as MemberRow[]).map((member) => ({
    memberId: member.id,
    displayName: member.display_name ?? member.users?.display_name ?? "Someone",
    active: member.status === "active",
  }));
}

export async function getMoneyInsights(
  session: Session,
  context: HouseContext,
  query: InsightsQuery,
  range: InsightRange,
): Promise<MoneyInsightsOutput> {
  const [expensesResult, splitsResult, members] = await Promise.all([
    session.supabase
      .from("expenses")
      .select(
        `id, expense_date, amount_paise, status, category_id, paid_by_member_id,
         expense_categories ( name ),
         payer:house_members!expenses_paid_by_member_id_fkey (
           display_name, users ( display_name )
         )`,
      )
      .eq("house_id", context.house.id)
      // BR-285 — a cost the reserve paid is charged to the pot, not to anybody
      // here. Including it would put spending on members who were never
      // charged for it, and the position would stop matching the settlement.
      .is("reserve_id", null)
      .neq("status", "void")
      .gte("expense_date", range.from)
      .lte("expense_date", range.to),
    session.supabase
      .from("expense_splits")
      .select(
        "expense_id, member_id, share_paise, guest_share_paise, dependent_share_paise, expenses!inner(expense_date)",
      )
      .eq("house_id", context.house.id)
      .gte("expenses.expense_date", range.from)
      .lte("expenses.expense_date", range.to),
    readMembers(session, context.house.id),
  ]);

  if (expensesResult.error) throw apiErrorFromPostgres(expensesResult.error);
  if (splitsResult.error) throw apiErrorFromPostgres(splitsResult.error);

  type ExpenseRow = {
    id: string;
    expense_date: string;
    amount_paise: number;
    status: string;
    category_id: string;
    paid_by_member_id: string;
    expense_categories: { name: string } | null;
    payer: { display_name: string | null; users: { display_name: string } | null } | null;
  };

  return buildMoneyInsights({
    range,
    members,
    isPot: context.shape.isPot,
    categoryFilter: query.categoryId,
    memberFilter: query.memberId,
    expenses: ((expensesResult.data ?? []) as unknown as ExpenseRow[]).map((expense) => ({
      expenseId: expense.id,
      date: expense.expense_date,
      amountPaise: expense.amount_paise,
      categoryId: expense.category_id,
      categoryName: expense.expense_categories?.name ?? "Uncategorised",
      paidByMemberId: expense.paid_by_member_id,
      paidByName:
        expense.payer?.display_name ?? expense.payer?.users?.display_name ?? "Someone",
      approved: expense.status === "approved",
    })),
    splits: (splitsResult.data ?? []).map((split) => ({
      expenseId: split.expense_id,
      memberId: split.member_id,
      sharePaise: split.share_paise,
      guestSharePaise: split.guest_share_paise,
      dependentSharePaise: split.dependent_share_paise,
    })),
  });
}

type AssignmentRow = {
  id: string;
  chore_date: string;
  assignee_member_id: string | null;
  effort_points: number;
  status: string;
  chore_templates: { name: string } | null;
  assignee: { display_name: string | null; users: { display_name: string } | null } | null;
};

const ASSIGNMENT_SELECT = `id, chore_date, assignee_member_id, effort_points, status,
   chore_templates ( name ),
   assignee:house_members!chore_assignments_assignee_member_id_fkey (
     display_name, users ( display_name )
   )`;

async function readAssignments(
  session: Session,
  houseId: string,
  range: { from: string; to: string },
): Promise<AssignmentRow[]> {
  const { data, error } = await session.supabase
    .from("chore_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("house_id", houseId)
    .gte("chore_date", range.from)
    .lte("chore_date", range.to);

  if (error) throw apiErrorFromPostgres(error);
  return (data ?? []) as unknown as AssignmentRow[];
}

function toAssignment(row: AssignmentRow) {
  return {
    assignmentId: row.id,
    choreDate: row.chore_date,
    memberId: row.assignee_member_id,
    memberName: row.assignee?.display_name ?? row.assignee?.users?.display_name ?? "Someone",
    templateName: row.chore_templates?.name ?? "Chore",
    points: row.effort_points,
    status: row.status as PointComponent["status"],
  };
}

export async function getChoreInsights(
  session: Session,
  context: HouseContext,
  query: InsightsQuery,
  range: InsightRange,
): Promise<ChoreInsightsOutput> {
  const [rows, members] = await Promise.all([
    readAssignments(session, context.house.id, range),
    readMembers(session, context.house.id),
  ]);

  return buildChoreInsights({
    range,
    members,
    memberFilter: query.memberId,
    isFamily: context.shape.isFamily,
    assignments: rows.map(toAssignment),
  });
}

export async function getFoodInsights(
  session: Session,
  context: HouseContext,
  query: InsightsQuery,
  range: InsightRange,
): Promise<FoodInsightsOutput> {
  const [mealsResult, participantsResult, preferencesResult] = await Promise.all([
    session.supabase
      .from("meals")
      .select("id, meal_date, name, source, total_cost_paise, foods ( normalised_name )")
      .eq("house_id", context.house.id)
      .gte("meal_date", range.from)
      .lte("meal_date", range.to),
    session.supabase
      .from("meal_participants")
      .select("meal_id, member_id, meals!inner(meal_date)")
      .eq("house_id", context.house.id)
      .gte("meals.meal_date", range.from)
      .lte("meals.meal_date", range.to),
    // Preferences are not date-bounded on purpose: an opinion is a standing
    // fact about a person, not something they only held in August.
    session.supabase
      .from("food_preferences")
      .select("member_id, rating, item_name, foods ( name, normalised_name )")
      .eq("house_id", context.house.id),
  ]);

  if (mealsResult.error) throw apiErrorFromPostgres(mealsResult.error);
  if (participantsResult.error) throw apiErrorFromPostgres(participantsResult.error);
  if (preferencesResult.error) throw apiErrorFromPostgres(preferencesResult.error);

  type MealRow = {
    id: string;
    meal_date: string;
    name: string;
    source: string;
    total_cost_paise: number;
    foods: { normalised_name: string } | null;
  };
  type PreferenceRow = {
    member_id: string;
    rating: string;
    item_name: string | null;
    foods: { name: string; normalised_name: string } | null;
  };

  const participants = new Map<string, string[]>();
  for (const row of participantsResult.data ?? []) {
    if (!row.member_id) continue;
    const list = participants.get(row.meal_id) ?? [];
    list.push(row.member_id);
    participants.set(row.meal_id, list);
  }

  const meals = ((mealsResult.data ?? []) as unknown as MealRow[]).map((meal) => ({
    mealId: meal.id,
    date: meal.meal_date,
    name: meal.name,
    // A one-off meal has no library entry, so it is normalised the same way
    // the library normalises: lowercased and collapsed.
    normalisedName: meal.foods?.normalised_name ?? normalise(meal.name),
    source: meal.source as "home_cooked" | "bought" | "ordered" | "other",
    costPaise: meal.total_cost_paise,
    participantMemberIds: participants.get(meal.id) ?? [],
  }));

  const opinions = ((preferencesResult.data ?? []) as unknown as PreferenceRow[])
    .map((preference) => {
      const name = preference.foods?.name ?? preference.item_name;
      if (!name) return null;
      return {
        name,
        normalisedName: preference.foods?.normalised_name ?? normalise(name),
        memberId: preference.member_id,
        rating: preference.rating as "like" | "okay" | "dislike",
      };
    })
    .filter((opinion): opinion is NonNullable<typeof opinion> => opinion !== null);

  return buildFoodInsights({ range, meals, opinions, memberFilter: query.memberId });
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getHomeInsights(
  session: Session,
  context: HouseContext,
  range: InsightRange,
): Promise<HomeInsightsOutput> {
  const [expenseCount, mealCount, assignments, decisionsResult, members] = await Promise.all([
    countIn(session, "expenses", context.house.id, "expense_date", range),
    countIn(session, "meals", context.house.id, "meal_date", range),
    readAssignments(session, context.house.id, range),
    session.supabase
      .from("decisions")
      .select("status")
      .eq("house_id", context.house.id)
      .gte("created_at", `${range.from}T00:00:00Z`)
      .lte("created_at", `${range.to}T23:59:59Z`),
    readMembers(session, context.house.id),
  ]);

  if (decisionsResult.error) throw apiErrorFromPostgres(decisionsResult.error);
  const decisions = decisionsResult.data ?? [];

  // Effort comes from the same assignments the chores view reports, so the two
  // screens can never put a different number of points against one member.
  const effort = new Map<string, number>();
  let choresConfirmed = 0;
  let choresMissed = 0;
  for (const row of assignments) {
    if (row.status === "confirmed") {
      choresConfirmed += 1;
      if (row.assignee_member_id) {
        effort.set(
          row.assignee_member_id,
          (effort.get(row.assignee_member_id) ?? 0) + Math.max(0, row.effort_points),
        );
      }
    }
    if (row.status === "missed" || row.status === "rejected") choresMissed += 1;
  }

  const active = members.filter((member) => member.active);

  return buildHomeInsights({
    range,
    expenseCount,
    mealCount,
    choresConfirmed,
    choresMissed,
    decisionsOpen: decisions.filter((decision) => decision.status === "waiting").length,
    decisionsResolved: decisions.filter((decision) => decision.status !== "waiting").length,
    activeMembers: active.length,
    isFamily: context.shape.isFamily,
    effortByMember: active.map((member) => ({
      memberId: member.memberId,
      displayName: member.displayName,
      points: effort.get(member.memberId) ?? 0,
    })),
  });
}

async function countIn(
  session: Session,
  table: "expenses" | "meals",
  houseId: string,
  dateColumn: "expense_date" | "meal_date",
  range: { from: string; to: string },
): Promise<number> {
  const { count, error } = await session.supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("house_id", houseId)
    .gte(dateColumn, range.from)
    .lte(dateColumn, range.to);

  if (error) throw apiErrorFromPostgres(error);
  return count ?? 0;
}

/**
 * The household financial position (IN-09).
 *
 * `paid` and `fair share` come from `getPeriodPosition` — the settlement's own
 * read — rather than from a second query written to look like it. That is what
 * makes "paid minus fair share equals the settlement's expense_net" true by
 * construction instead of by coincidence.
 */
export async function getFinancialPosition(
  session: Session,
  context: HouseContext,
  period?: string,
): Promise<FinancialPositionOutput> {
  const month = period ?? houseToday(context.house.timezone).slice(0, 7);
  const [view, expectedResult, reservesResult] = await Promise.all([
    getPeriodPosition(session, context.house.id, month),
    session.supabase
      .from("member_expected_contributions")
      .select("member_id, amount_paise, effective_from, effective_to")
      .eq("house_id", context.house.id)
      .lte("effective_from", endOfMonth(month)),
    session.supabase
      .from("reserve_movements")
      .select("created_at, kind, amount_paise, note, reserves!inner(active)")
      .eq("house_id", context.house.id)
      .order("created_at", { ascending: false }),
  ]);

  if (expectedResult.error) throw apiErrorFromPostgres(expectedResult.error);
  if (reservesResult.error) throw apiErrorFromPostgres(reservesResult.error);

  // An expectation applies to a month if it had taken effect by the month's end
  // and had not been superseded before the month began (BR-280).
  const monthStart = `${month}-01`;
  const expected = new Map<string, number>();
  for (const row of expectedResult.data ?? []) {
    if (row.effective_to && row.effective_to < monthStart) continue;
    expected.set(row.member_id, row.amount_paise);
  }

  type MovementRow = {
    created_at: string;
    kind: string;
    amount_paise: number;
    note: string | null;
  };
  const movements = (reservesResult.data ?? []) as unknown as MovementRow[];

  return buildFinancialPosition({
    period: month,
    members: view.position.map((row) => ({
      memberId: row.memberId,
      displayName: row.displayName,
      expectedContributionPaise: expected.get(row.memberId) ?? 0,
      paidPaise: row.paidPaise,
      fairSharePaise: row.fairSharePaise,
    })),
    // BR-283 — a contribution adds, a draw removes, and the pot never goes
    // negative in the database, so this is a plain sum of what is stored.
    reserveBalancePaise: movements.reduce(
      (sum, movement) =>
        sum + (movement.kind === "contribution" ? movement.amount_paise : -movement.amount_paise),
      0,
    ),
    reserveMovements: movements.map((movement) => ({
      date: movement.created_at.slice(0, 10),
      kind: movement.kind,
      amountPaise: movement.amount_paise,
      note: movement.note,
    })),
  });
}

export interface HistoryRecord {
  section: "Expense" | "Chore" | "Meal" | "Decision";
  date: string;
  what: string;
  who: string;
  amountPaise: number | null;
  detail: string;
}

/**
 * Every record the Home holds, for the permanent export (IN-10, NFR-19).
 *
 * Not date-bounded: "full history" means the Home's whole record, which is the
 * point of the guarantee. A member can take this at any time with no tier, no
 * cap and no waiting period — so the read has no gate on it either, and RLS
 * is what decides they may see it.
 */
export async function getFullHistory(
  session: Session,
  context: HouseContext,
): Promise<HistoryRecord[]> {
  const [expensesResult, assignmentsResult, mealsResult, decisionsResult, members] =
    await Promise.all([
      session.supabase
        .from("expenses")
        .select(
          `expense_date, description, amount_paise, status,
           expense_categories ( name ),
           payer:house_members!expenses_paid_by_member_id_fkey (
             display_name, users ( display_name )
           )`,
        )
        .eq("house_id", context.house.id)
        .order("expense_date", { ascending: true }),
      session.supabase
        .from("chore_assignments")
        .select(ASSIGNMENT_SELECT)
        .eq("house_id", context.house.id)
        .order("chore_date", { ascending: true }),
      session.supabase
        .from("meals")
        .select("meal_date, name, source, total_cost_paise, meal_type")
        .eq("house_id", context.house.id)
        .order("meal_date", { ascending: true }),
      session.supabase
        .from("decisions")
        .select("created_at, type, level, status, requested_by")
        .eq("house_id", context.house.id)
        .order("created_at", { ascending: true }),
      readMembers(session, context.house.id),
    ]);

  if (expensesResult.error) throw apiErrorFromPostgres(expensesResult.error);
  if (assignmentsResult.error) throw apiErrorFromPostgres(assignmentsResult.error);
  if (mealsResult.error) throw apiErrorFromPostgres(mealsResult.error);
  if (decisionsResult.error) throw apiErrorFromPostgres(decisionsResult.error);

  type ExpenseHistoryRow = {
    expense_date: string;
    description: string | null;
    amount_paise: number;
    status: string;
    expense_categories: { name: string } | null;
    payer: { display_name: string | null; users: { display_name: string } | null } | null;
  };

  const nameOf = (memberId: string | null) =>
    members.find((member) => member.memberId === memberId)?.displayName ?? "Someone";

  const records: HistoryRecord[] = [
    ...((expensesResult.data ?? []) as unknown as ExpenseHistoryRow[]).map((row) => ({
      section: "Expense" as const,
      date: row.expense_date,
      what: row.description ?? row.expense_categories?.name ?? "Expense",
      who: row.payer?.display_name ?? row.payer?.users?.display_name ?? "Someone",
      amountPaise: row.amount_paise,
      detail: `${row.expense_categories?.name ?? "Uncategorised"} · ${row.status}`,
    })),
    ...((assignmentsResult.data ?? []) as unknown as AssignmentRow[]).map((row) => {
      const assignment = toAssignment(row);
      return {
        section: "Chore" as const,
        date: assignment.choreDate,
        what: assignment.templateName,
        who: row.assignee_member_id ? assignment.memberName : "Unclaimed",
        amountPaise: null,
        detail: `${assignment.points} points · ${assignment.status}`,
      };
    }),
    ...(mealsResult.data ?? []).map((row) => ({
      section: "Meal" as const,
      date: row.meal_date,
      what: row.name,
      who: "The home",
      amountPaise: row.total_cost_paise,
      detail: `${row.meal_type} · ${row.source}`,
    })),
    ...(decisionsResult.data ?? []).map((row) => ({
      section: "Decision" as const,
      date: row.created_at.slice(0, 10),
      what: row.type,
      who: nameOf(row.requested_by),
      amountPaise: null,
      detail: `${row.level} · ${row.status}`,
    })),
  ];

  return records.sort(
    (a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section),
  );
}

/**
 * Point explainability (EF-12): the dated records behind one member's figure.
 *
 * The caller passes the figure it displayed, and the breakdown reports whether
 * the records reconcile with it — so a screen showing a stale total says so
 * rather than quietly listing rows that add up to something else.
 */
export async function getPointBreakdown(
  session: Session,
  context: HouseContext,
  options: { memberId: string; from: string; to: string; claimedPoints: number },
): Promise<PointBreakdown> {
  const rows = await readAssignments(session, context.house.id, options);
  const members = await readMembers(session, context.house.id);

  const components: PointComponent[] = rows
    .filter((row) => row.assignee_member_id === options.memberId)
    .map((row) => {
      const assignment = toAssignment(row);
      return {
        date: assignment.choreDate,
        label: assignment.templateName,
        points: Math.max(0, assignment.points),
        status: assignment.status,
      };
    });

  return explainPoints({
    memberId: options.memberId,
    displayName:
      members.find((member) => member.memberId === options.memberId)?.displayName ?? "Someone",
    claimedPoints: options.claimedPoints,
    components: earnedComponents(components),
  });
}
