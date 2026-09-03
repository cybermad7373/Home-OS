import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import type { Session } from "./house";
import type {
  SplitGuest,
  SplitParticipant,
  SplitRoom,
  SplitShare,
} from "@/lib/domain/expenses/split";
import type {
  ExpenseCategoryRow,
  ExpenseRow,
  MonthlyPeriodRow,
  RecurringExpenseRow,
  SplitBasis,
} from "@/lib/types/database";

/**
 * The expense repository. SQL lives here and in the migrations, nowhere else.
 *
 * The split arithmetic is deliberately absent: it belongs to
 * lib/domain/expenses/split.ts, which knows nothing about a database. This file
 * fetches the facts that calculator needs, and stores what it returns.
 */

export interface ExpenseView {
  id: string;
  amountPaise: number;
  description: string | null;
  expenseDate: string;
  splitBasis: SplitBasis;
  status: ExpenseRow["status"];
  receiptUrl: string | null;
  isAdjustment: boolean;
  adjustmentForPeriod: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  /** The meal it feeds, if any — optional, either direction, never required (FD-07). */
  mealId: string | null;
  category: { id: string; name: string; icon: string | null };
  paidBy: { memberId: string; displayName: string; avatarUrl: string | null };
  approvedBy: { memberId: string; displayName: string } | null;
  period: string;
  /** The caller's own share, the number they actually care about. */
  yourSharePaise: number;
  splits: {
    memberId: string;
    displayName: string;
    sharePaise: number;
    guestSharePaise: number;
    dependentSharePaise: number;
  }[];
}

const EXPENSE_SELECT = `
  *,
  expense_categories ( id, name, icon ),
  monthly_periods ( period, status ),
  payer:house_members!expenses_paid_by_member_id_fkey (
    id, users ( display_name, avatar_url )
  ),
  approver:house_members!expenses_approved_by_fkey (
    id, users ( display_name )
  ),
  expense_splits (
    member_id, share_paise, guest_share_paise, dependent_share_paise,
    house_members ( id, users ( display_name ) )
  )
`;

type RawExpense = ExpenseRow & {
  expense_categories: { id: string; name: string; icon: string | null } | null;
  monthly_periods: { period: string; status: string } | null;
  payer: { id: string; users: { display_name: string; avatar_url: string | null } | null } | null;
  approver: { id: string; users: { display_name: string } | null } | null;
  expense_splits: {
    member_id: string;
    share_paise: number;
    guest_share_paise: number;
    dependent_share_paise: number;
    house_members: { id: string; users: { display_name: string } | null } | null;
  }[];
};

function toExpenseView(row: RawExpense, myMemberId: string): ExpenseView {
  const mine = row.expense_splits.find((split) => split.member_id === myMemberId);

  return {
    id: row.id,
    amountPaise: row.amount_paise,
    description: row.description,
    expenseDate: row.expense_date,
    splitBasis: row.split_basis,
    status: row.status,
    receiptUrl: row.receipt_url,
    isAdjustment: row.is_adjustment,
    adjustmentForPeriod: row.adjustment_for_period,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    mealId: row.meal_id,
    category: row.expense_categories ?? { id: row.category_id, name: "Other", icon: null },
    paidBy: {
      memberId: row.paid_by_member_id,
      displayName: row.payer?.users?.display_name ?? "Someone",
      avatarUrl: row.payer?.users?.avatar_url ?? null,
    },
    approvedBy: row.approver
      ? {
          memberId: row.approver.id,
          displayName: row.approver.users?.display_name ?? "Someone",
        }
      : null,
    period: row.monthly_periods?.period ?? row.expense_date.slice(0, 7),
    yourSharePaise:
      (mine?.share_paise ?? 0) +
      (mine?.guest_share_paise ?? 0) +
      (mine?.dependent_share_paise ?? 0),
    splits: row.expense_splits
      .map((split) => ({
        memberId: split.member_id,
        displayName: split.house_members?.users?.display_name ?? "Someone",
        sharePaise: split.share_paise,
        guestSharePaise: split.guest_share_paise,
        dependentSharePaise: split.dependent_share_paise,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
}

export async function listCategories(
  session: Session,
  houseId: string,
): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await session.supabase
    .from("expense_categories")
    .select("*")
    .eq("house_id", houseId)
    .order("name");
  if (error) throw apiErrorFromPostgres(error);
  return data ?? [];
}

export interface ExpenseFilters {
  period?: string;
  categoryId?: string;
  memberId?: string;
  from?: string;
  to?: string;
  status?: ExpenseRow["status"];
  page?: number;
  pageSize?: number;
}

export interface ExpenseListResult {
  expenses: ExpenseView[];
  totalPaise: number;
  yourSharePaise: number;
  yourPaidPaise: number;
  count: number;
  hasMore: boolean;
}

/** S-16 — the list, with the running totals its sticky header shows. */
export async function listExpenses(
  session: Session,
  houseId: string,
  myMemberId: string,
  filters: ExpenseFilters = {},
): Promise<ExpenseListResult> {
  const pageSize = filters.pageSize ?? 30;
  const page = filters.page ?? 0;

  let query = session.supabase
    .from("expenses")
    .select(EXPENSE_SELECT, { count: "exact" })
    .eq("house_id", houseId)
    .neq("status", "void")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.memberId) query = query.eq("paid_by_member_id", filters.memberId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("expense_date", filters.from);
  if (filters.to) query = query.lte("expense_date", filters.to);
  if (filters.period) {
    query = query
      .gte("expense_date", `${filters.period}-01`)
      .lte("expense_date", endOfMonth(filters.period));
  }

  const { data, error, count } = await query;
  if (error) throw apiErrorFromPostgres(error);

  const expenses = (data as unknown as RawExpense[]).map((row) =>
    toExpenseView(row, myMemberId),
  );

  // BR-084 — a pending expense is counted by nobody until it is approved.
  const counted = expenses.filter((expense) => expense.status === "approved");

  return {
    expenses,
    totalPaise: counted.reduce((sum, expense) => sum + expense.amountPaise, 0),
    yourSharePaise: counted.reduce((sum, expense) => sum + expense.yourSharePaise, 0),
    yourPaidPaise: counted
      .filter((expense) => expense.paidBy.memberId === myMemberId)
      .reduce((sum, expense) => sum + expense.amountPaise, 0),
    count: count ?? expenses.length,
    hasMore: (count ?? 0) > (page + 1) * pageSize,
  };
}

export async function getExpense(
  session: Session,
  expenseId: string,
  myMemberId: string,
): Promise<ExpenseView> {
  const { data, error } = await session.supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("id", expenseId)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");
  return toExpenseView(data as unknown as RawExpense, myMemberId);
}

/** S-19 — everything waiting on somebody else's approval, the caller excluded as payer. */
export async function listPendingApprovals(
  session: Session,
  houseId: string,
  myMemberId: string,
): Promise<ExpenseView[]> {
  const { data, error } = await session.supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("house_id", houseId)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false });

  if (error) throw apiErrorFromPostgres(error);

  return (data as unknown as RawExpense[])
    .map((row) => toExpenseView(row, myMemberId))
    // BR-085 — you cannot approve your own, so it is not "awaiting you".
    .filter((expense) => expense.paidBy.memberId !== myMemberId);
}

/**
 * Everything the split calculator needs, as of one date.
 *
 * Membership and occupancy are read as they stood on the expense date, not as
 * they stand today — that is what makes a late July expense split against
 * July's household (docs/06-ALGORITHMS.md section 3.4).
 */
export async function splitContextOn(
  session: Session,
  houseId: string,
  date: string,
): Promise<{ members: SplitParticipant[]; rooms: SplitRoom[]; guests: SplitGuest[] }> {
  const [membersResult, roomsResult, assignmentsResult, guestsResult] =
    await Promise.all([
      session.supabase
        .from("house_members")
        .select(
          "id, joined_date, left_date, status, shares_cost, guardian_member_id",
        )
        .eq("house_id", houseId),
      session.supabase
        .from("rooms")
        .select("id, monthly_rent_paise")
        .eq("house_id", houseId)
        .is("deleted_at", null),
      session.supabase
        .from("room_assignments")
        .select("room_id, member_id, from_date, to_date")
        .eq("house_id", houseId),
      // Guests staying on the date, whoever they belong to. Filtered here
      // rather than in the calculator so the query stays one round trip.
      session.supabase
        .from("guests")
        .select("id, host_member_id, counts_for_expense, from_date, to_date")
        .eq("house_id", houseId)
        .lte("from_date", date)
        .gte("to_date", date),
    ]);

  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);
  if (roomsResult.error) throw apiErrorFromPostgres(roomsResult.error);
  if (assignmentsResult.error) throw apiErrorFromPostgres(assignmentsResult.error);
  if (guestsResult.error) throw apiErrorFromPostgres(guestsResult.error);

  const members: SplitParticipant[] = (membersResult.data ?? [])
    // A never-approved joiner was never a member; a former one still was, on the
    // dates they were here, which the dated window below decides.
    .filter((member) => member.status !== "requested")
    .map((member) => ({
      memberId: member.id,
      joinedDate: member.joined_date,
      leftDate: member.left_date,
      // A dependent is a head the house buys food for and a member who owes
      // nothing. Their share rides on their guardian, exactly like a guest's
      // rides on their host.
      sharesCost: member.shares_cost,
      guardianMemberId: member.guardian_member_id,
    }));

  const occupancyByRoom = new Map<string, string[]>();
  for (const assignment of assignmentsResult.data ?? []) {
    const startsBefore = assignment.from_date <= date;
    const endsAfter = assignment.to_date === null || assignment.to_date >= date;
    if (!startsBefore || !endsAfter) continue;
    const occupants = occupancyByRoom.get(assignment.room_id) ?? [];
    occupants.push(assignment.member_id);
    occupancyByRoom.set(assignment.room_id, occupants);
  }

  const rooms: SplitRoom[] = (roomsResult.data ?? []).map((room) => ({
    roomId: room.id,
    monthlyRentPaise: room.monthly_rent_paise,
    occupantMemberIds: occupancyByRoom.get(room.id) ?? [],
  }));

  // EX-06 — a guest is an extra head on the days they are here, and that head
  // is billed to the member who invited them, never spread across the house.
  // The calculator applies both rules; this only supplies the facts.
  const guests: SplitGuest[] = (guestsResult.data ?? []).map((guest) => ({
    guestId: guest.id,
    hostMemberId: guest.host_member_id,
    countsForExpense: guest.counts_for_expense,
    fromDate: guest.from_date,
    toDate: guest.to_date,
  }));

  return { members, rooms, guests };
}

export async function getPeriod(
  session: Session,
  houseId: string,
  period: string,
): Promise<MonthlyPeriodRow | null> {
  const { data, error } = await session.supabase
    .from("monthly_periods")
    .select("*")
    .eq("house_id", houseId)
    .eq("period", period)
    .maybeSingle();
  if (error) throw apiErrorFromPostgres(error);
  return data;
}

export async function listRecurring(
  session: Session,
  houseId: string,
): Promise<RecurringExpenseRow[]> {
  const { data, error } = await session.supabase
    .from("recurring_expenses")
    .select("*")
    .eq("house_id", houseId)
    .order("day_of_month");
  if (error) throw apiErrorFromPostgres(error);
  return data ?? [];
}

/**
 * Category and recurring writes.
 *
 * These live here rather than in the route handlers that used to hold them.
 * `app/` validates, authorises and answers; the SQL is this file's job
 * (AGENTS.md, "Project shape"). Every one of them scopes by `house_id` as well
 * as by `id`, so a well-formed request naming another Home's row finds nothing
 * rather than relying on RLS alone to refuse it.
 */
export async function createCategory(
  session: Session,
  houseId: string,
  input: { name: string; icon?: string | null; monthlyBudgetPaise: number | null },
): Promise<ExpenseCategoryRow> {
  const { data, error } = await session.supabase
    .from("expense_categories")
    .insert({
      house_id: houseId,
      name: input.name,
      icon: input.icon || null,
      monthly_budget_paise: input.monthlyBudgetPaise,
    })
    .select("*")
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return data;
}

export async function updateCategory(
  session: Session,
  houseId: string,
  id: string,
  patch: Partial<ExpenseCategoryRow>,
): Promise<ExpenseCategoryRow> {
  const { data, error } = await session.supabase
    .from("expense_categories")
    .update(patch)
    .eq("id", id)
    .eq("house_id", houseId)
    .select("*")
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");
  return data;
}

export async function createRecurring(
  session: Session,
  houseId: string,
  input: {
    name: string;
    amountPaise: number;
    categoryId: string;
    paidByMemberId: string | null;
    splitBasis: RecurringExpenseRow["split_basis"];
    dayOfMonth: number;
    autoApprove: boolean;
    active: boolean;
    nextRunDate: string;
  },
): Promise<RecurringExpenseRow> {
  const { data, error } = await session.supabase
    .from("recurring_expenses")
    .insert({
      house_id: houseId,
      name: input.name,
      amount_paise: input.amountPaise,
      category_id: input.categoryId,
      paid_by_member_id: input.paidByMemberId,
      split_basis: input.splitBasis,
      day_of_month: input.dayOfMonth,
      auto_approve: input.autoApprove,
      active: input.active,
      next_run_date: input.nextRunDate,
    })
    .select("*")
    .single();

  if (error) throw apiErrorFromPostgres(error);
  return data;
}

export async function updateRecurring(
  session: Session,
  houseId: string,
  id: string,
  patch: Partial<RecurringExpenseRow>,
): Promise<RecurringExpenseRow> {
  const { data, error } = await session.supabase
    .from("recurring_expenses")
    .update(patch)
    .eq("id", id)
    .eq("house_id", houseId)
    .select("*")
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");
  return data;
}

/** BR-098 — deleting stops future posting; instances already posted stay. */
export async function deleteRecurring(
  session: Session,
  houseId: string,
  id: string,
): Promise<void> {
  const { error } = await session.supabase
    .from("recurring_expenses")
    .delete()
    .eq("id", id)
    .eq("house_id", houseId);

  if (error) throw apiErrorFromPostgres(error);
}

/**
 * Writes the expense and its splits in one transaction — see migration 017.
 *
 * `houseId` is passed rather than inferred. The function used to work out the
 * Home for itself, which for anybody in more than one Home meant an expense
 * could be booked against the wrong household — see migration
 * 20260903000001.
 */
export async function createExpense(
  session: Session,
  houseId: string,
  input: {
    categoryId: string;
    amountPaise: number;
    expenseDate: string;
    splitBasis: SplitBasis;
    splits: SplitShare[];
    description?: string;
    paidByMemberId?: string;
    receiptUrl?: string;
    period?: string;
    isAdjustment?: boolean;
    adjustmentForPeriod?: string;
  },
): Promise<string> {
  const { data, error } = await session.supabase.rpc("create_expense", {
    p_house_id: houseId,
    p_category_id: input.categoryId,
    p_amount_paise: input.amountPaise,
    p_expense_date: input.expenseDate,
    p_split_basis: input.splitBasis,
    p_splits: input.splits.map((share) => ({
      member_id: share.memberId,
      share_paise: share.sharePaise,
      guest_share_paise: share.guestSharePaise,
      dependent_share_paise: share.dependentSharePaise,
      basis_note: share.basisNote ?? null,
    })),
    p_description: input.description ?? undefined,
    p_paid_by_member_id: input.paidByMemberId ?? undefined,
    p_receipt_url: input.receiptUrl ?? undefined,
    p_period: input.period ?? undefined,
    p_is_adjustment: input.isAdjustment ?? false,
    p_adjustment_for_period: input.adjustmentForPeriod ?? undefined,
  });

  if (error) throw apiErrorFromPostgres(error);
  return data as unknown as string;
}

export async function approveExpense(
  session: Session,
  expenseId: string,
  approve: boolean,
  reason?: string,
): Promise<string> {
  const { data, error } = await session.supabase.rpc("approve_expense", {
    p_expense_id: expenseId,
    p_approve: approve,
    p_reason: reason ?? undefined,
  });
  if (error) throw apiErrorFromPostgres(error);
  return data as unknown as string;
}

export async function voidExpense(
  session: Session,
  expenseId: string,
  reason: string,
): Promise<void> {
  const { error } = await session.supabase.rpc("void_expense", {
    p_expense_id: expenseId,
    p_reason: reason,
  });
  if (error) throw apiErrorFromPostgres(error);
}

function endOfMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, "0")}`;
}

export { endOfMonth };
