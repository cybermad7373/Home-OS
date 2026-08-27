import "server-only";

import { apiErrorFromPostgres } from "@/lib/api/errors";
import {
  summariseDailyCost,
  type CategoryBudget,
  type DailyCostSummary,
  type DatedAmount,
} from "@/lib/domain/analytics/daily-cost";
import type { ExpenseLedgerRow } from "@/lib/domain/analytics/csv";
import {
  buildMemberPositionReport,
  buildEffortConcentrationReport,
  buildSpendReport,
  type EffortConcentrationReport,
  type MemberPositionReport,
  type SpendReport,
} from "@/lib/domain/analytics/report";
import { endOfMonth } from "./expenses";
import { houseToday } from "@/lib/utils/date";
import type { Session } from "./house";
import type { HouseRow, HouseSettingsRow } from "@/lib/types/database";

/**
 * Reads the facts the running-cost summary needs and hands them to the pure
 * function in lib/domain/analytics. No arithmetic happens here.
 */

/** The first of the month a date falls in. */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export interface DailyCostOptions {
  /** 'YYYY-MM'. Defaults to the month the house is currently in. */
  period?: string;
}

export interface SpendReportOptions {
  months?: number;
}

export interface MemberPositionReportOptions {
  /** 'YYYY-MM'. Defaults to the month the house is currently in. */
  period?: string;
}

export interface EffortConcentrationReportOptions {
  months?: number;
}

/** Approved spend grouped for the analytics trend view. */
export async function getSpendReport(
  session: Session,
  house: HouseRow,
  options: SpendReportOptions = {},
): Promise<SpendReport> {
  const count = Math.min(12, Math.max(1, Math.trunc(options.months ?? 6)));
  const today = houseToday(house.timezone);
  const months = previousMonths(today.slice(0, 7), count);
  const { data, error } = await session.supabase
    .from("expenses")
    .select("expense_date, amount_paise, category_id, expense_categories(name)")
    .eq("house_id", house.id)
    .eq("status", "approved")
    .gte("expense_date", `${months[0]}-01`)
    .lte("expense_date", lastDayOf(months.at(-1)!));

  if (error) throw apiErrorFromPostgres(error);

  const expenses = (data ?? []).map((row) => {
    const joined = row as unknown as {
      expense_date: string;
      amount_paise: number;
      category_id: string;
      expense_categories: { name: string } | null;
    };
    return {
      period: joined.expense_date.slice(0, 7),
      categoryId: joined.category_id,
      categoryName: joined.expense_categories?.name ?? "Uncategorised",
      amountPaise: joined.amount_paise,
    };
  });

  return buildSpendReport({ expenses, months });
}

/** Approved paid-versus-fair-share position for one calendar month. */
export async function getMemberPositionReport(
  session: Session,
  house: HouseRow,
  options: MemberPositionReportOptions = {},
): Promise<MemberPositionReport> {
  const period = options.period ?? houseToday(house.timezone).slice(0, 7);
  const monthStart = `${period}-01`;
  const monthEnd = endOfMonth(period);
  const [expensesResult, splitsResult, membersResult] = await Promise.all([
    session.supabase
      .from("expenses")
      .select("id, paid_by_member_id, amount_paise, status")
      .eq("house_id", house.id)
      .gte("expense_date", monthStart)
      .lte("expense_date", monthEnd),
    session.supabase
      .from("expense_splits")
      .select("expense_id, member_id, share_paise, guest_share_paise, dependent_share_paise, expenses!inner(expense_date)")
      .eq("house_id", house.id)
      .gte("expenses.expense_date", monthStart)
      .lte("expenses.expense_date", monthEnd),
    session.supabase
      .from("house_members")
      .select("id, status, display_name, users(display_name)")
      .eq("house_id", house.id),
  ]);

  if (expensesResult.error) throw apiErrorFromPostgres(expensesResult.error);
  if (splitsResult.error) throw apiErrorFromPostgres(splitsResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);

  type MemberRow = {
    id: string;
    status: string;
    display_name: string | null;
    users: { display_name: string } | null;
  };

  return buildMemberPositionReport({
    period,
    expenses: (expensesResult.data ?? []).map((expense) => ({
      expenseId: expense.id,
      paidByMemberId: expense.paid_by_member_id,
      amountPaise: expense.amount_paise,
      approved: expense.status === "approved",
    })),
    splits: (splitsResult.data ?? []).map((split) => ({
      expenseId: split.expense_id,
      memberId: split.member_id,
      sharePaise: split.share_paise,
      guestSharePaise: split.guest_share_paise,
      dependentSharePaise: split.dependent_share_paise,
    })),
    members: ((membersResult.data ?? []) as unknown as MemberRow[]).map((member) => ({
      memberId: member.id,
      displayName: member.display_name ?? member.users?.display_name ?? "Someone",
      active: member.status === "active",
    })),
  });
}

/** Closed weekly effort grouped into a month-over-month concentration trend. */
export async function getEffortConcentrationReport(
  session: Session,
  house: HouseRow,
  options: EffortConcentrationReportOptions = {},
): Promise<EffortConcentrationReport> {
  const count = Math.min(12, Math.max(1, Math.trunc(options.months ?? 6)));
  const current = houseToday(house.timezone).slice(0, 7);
  const months = previousMonths(current, count);
  const { data, error } = await session.supabase
    .from("effort_ledger")
    .select("week_start, member_id, earned_points")
    .eq("house_id", house.id)
    .gte("week_start", `${months[0]}-01`)
    .lte("week_start", endOfMonth(months.at(-1)!));

  if (error) throw apiErrorFromPostgres(error);

  return buildEffortConcentrationReport({
    months,
    rows: (data ?? []).map((row) => ({
      month: row.week_start.slice(0, 7),
      memberId: row.member_id,
      earnedPoints: row.earned_points,
    })),
  });
}

export interface ExpenseLedgerOptions {
  /** 'YYYY-MM'. Defaults to the month the house is currently in. */
  period?: string;
}

/**
 * Every non-void expense of one month, flattened for the CSV export. Pending
 * rows are included and carry their status: an export is a record of what
 * happened, not the approved-only figure the charts report.
 */
export async function getExpenseLedger(
  session: Session,
  house: HouseRow,
  options: ExpenseLedgerOptions = {},
): Promise<{ period: string; rows: ExpenseLedgerRow[] }> {
  const period = options.period ?? houseToday(house.timezone).slice(0, 7);
  const { data, error } = await session.supabase
    .from("expenses")
    .select(
      `expense_date, description, amount_paise, status, split_basis, approved_at,
       expense_categories ( name ),
       payer:house_members!expenses_paid_by_member_id_fkey (
         display_name, users ( display_name )
       )`,
    )
    .eq("house_id", house.id)
    .neq("status", "void")
    .gte("expense_date", `${period}-01`)
    .lte("expense_date", endOfMonth(period))
    .order("expense_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw apiErrorFromPostgres(error);

  type LedgerRow = {
    expense_date: string;
    description: string | null;
    amount_paise: number;
    status: string;
    split_basis: string;
    approved_at: string | null;
    expense_categories: { name: string } | null;
    payer: { display_name: string | null; users: { display_name: string } | null } | null;
  };

  const rows = ((data ?? []) as unknown as LedgerRow[]).map((row) => ({
    date: row.expense_date,
    description: row.description ?? "",
    categoryName: row.expense_categories?.name ?? "Uncategorised",
    paidBy: row.payer?.display_name ?? row.payer?.users?.display_name ?? "Someone",
    amountPaise: row.amount_paise,
    status: row.status,
    splitMethod: row.split_basis,
    approvedAt: row.approved_at,
  }));

  return { period, rows };
}

function previousMonths(current: string, count: number): string[] {
  const [year, month] = current.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export async function getDailyCost(
  session: Session,
  house: HouseRow,
  settings: HouseSettingsRow,
  options: DailyCostOptions = {},
): Promise<DailyCostSummary & { period: string }> {
  const today = houseToday(house.timezone);
  const period = options.period ?? today.slice(0, 7);
  const monthStart = `${period}-01`;

  // Looking at a month that has already ended: every day of it has elapsed, so
  // the summary should treat the last day as "today" rather than reporting a
  // month with three days in it.
  const isCurrentMonth = period === today.slice(0, 7);
  const monthEnd = lastDayOf(period);
  const asOf = isCurrentMonth ? today : monthEnd;

  const [expensesResult, categoriesResult, membersResult, guestsResult] =
    await Promise.all([
      // Only approved money counts. A pending expense may still be rejected,
      // and showing it in the running cost would make the number jump backwards
      // when somebody declines it.
      session.supabase
        .from("expenses")
        .select("expense_date, amount_paise, category_id")
        .eq("house_id", house.id)
        .eq("status", "approved")
        .gte("expense_date", monthStart)
        .lte("expense_date", monthEnd),
      session.supabase
        .from("expense_categories")
        .select("id, name, icon, monthly_budget_paise")
        .eq("house_id", house.id)
        .eq("active", true),
      // Heads, not accounts: a dependent eats. Anybody who had left before the
      // month began is not a head in it.
      session.supabase
        .from("house_members")
        .select("id, status, joined_date, left_date")
        .eq("house_id", house.id)
        .eq("status", "active"),
      session.supabase
        .from("guests")
        .select("id, from_date, to_date, counts_for_expense")
        .eq("house_id", house.id)
        .eq("counts_for_expense", true)
        .lte("from_date", asOf)
        .gte("to_date", asOf),
    ]);

  if (expensesResult.error) throw apiErrorFromPostgres(expensesResult.error);
  if (categoriesResult.error) throw apiErrorFromPostgres(categoriesResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);
  if (guestsResult.error) throw apiErrorFromPostgres(guestsResult.error);

  const expenses: DatedAmount[] = (expensesResult.data ?? []).map((row) => ({
    date: row.expense_date,
    amountPaise: row.amount_paise,
    categoryId: row.category_id,
  }));

  const categories: CategoryBudget[] = (categoriesResult.data ?? []).map((row) => ({
    categoryId: row.id,
    name: row.name,
    icon: row.icon,
    monthlyBudgetPaise: row.monthly_budget_paise,
  }));

  const residents = (membersResult.data ?? []).filter(
    (member) => member.left_date === null || member.left_date >= monthStart,
  );

  const summary = summariseDailyCost({
    expenses,
    monthStart,
    today: asOf,
    heads: residents.length + (guestsResult.data ?? []).length,
    categories,
    dailyBudgetPaise: settings.daily_budget_paise,
  });

  return { ...summary, period };
}

function lastDayOf(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(days).padStart(2, "0")}`;
}
