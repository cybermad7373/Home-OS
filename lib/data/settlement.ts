import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import {
  applyAdjustments,
  checkSettlement,
  computeBalances,
  distributePenaltyPool,
  minimiseTransfers,
  type BalanceAdjustment,
  type ComputedBalance,
  type Payment,
} from "@/lib/domain/settlement/netting";
import { buildUpiLink, settlementNote } from "@/lib/domain/settlement/upi";
import { endOfMonth } from "./expenses";
import type { Session } from "./house";
import type { MonthlyPeriodRow, SettlementStatus } from "@/lib/types/database";

/**
 * The settlement repository.
 *
 * It gathers the month's facts, hands them to the pure netting functions, and
 * stores what comes back. The arithmetic lives in lib/domain/settlement.
 */

export interface PeriodPosition {
  memberId: string;
  displayName: string;
  upiVpa: string | null;
  paidPaise: number;
  fairSharePaise: number;
  netPaise: number;
}

export interface PeriodView {
  period: string;
  periodId: string | null;
  status: MonthlyPeriodRow["status"] | "open";
  totalExpensePaise: number;
  pendingApprovals: number;
  monthEnded: boolean;
  reopenCount: number;
  position: PeriodPosition[];
  categoryTotals: { name: string; icon: string | null; totalPaise: number }[];
}

export interface SettlementView {
  id: string;
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountPaise: number;
  status: SettlementStatus;
  upiLink: string | null;
  isDelta: boolean;
  markedPaidAt: string | null;
  confirmedAt: string | null;
}

/**
 * The live position for a month, computed on read.
 *
 * This is the *before* view — what the month looks like right now. Once closed,
 * the stored balances take over and are never recomputed (DR-09).
 */
export async function getPeriodPosition(
  session: Session,
  houseId: string,
  period: string,
): Promise<PeriodView> {
  const [periodResult, expensesResult, splitsResult, membersResult] = await Promise.all([
    session.supabase
      .from("monthly_periods")
      .select("*")
      .eq("house_id", houseId)
      .eq("period", period)
      .maybeSingle(),
    session.supabase
      .from("expenses")
      .select("id, amount_paise, paid_by_member_id, status, category_id, expense_categories(name, icon)")
      .eq("house_id", houseId)
      .gte("expense_date", `${period}-01`)
      .lte("expense_date", endOfMonth(period)),
    session.supabase
      .from("expense_splits")
      .select("member_id, share_paise, guest_share_paise, expenses!inner(status, expense_date)")
      .eq("house_id", houseId)
      .gte("expenses.expense_date", `${period}-01`)
      .lte("expenses.expense_date", endOfMonth(period)),
    session.supabase
      .from("house_members")
      .select("id, status, users(display_name, upi_vpa)")
      .eq("house_id", houseId),
  ]);

  if (periodResult.error) throw apiErrorFromPostgres(periodResult.error);
  if (expensesResult.error) throw apiErrorFromPostgres(expensesResult.error);
  if (splitsResult.error) throw apiErrorFromPostgres(splitsResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);

  type ExpenseRowLite = {
    amount_paise: number;
    paid_by_member_id: string;
    status: string;
    expense_categories: { name: string; icon: string | null } | null;
  };
  type SplitRowLite = {
    member_id: string;
    share_paise: number;
    guest_share_paise: number;
    expenses: { status: string } | null;
  };
  type MemberRowLite = {
    id: string;
    status: string;
    users: { display_name: string; upi_vpa: string | null } | null;
  };

  const expenses = (expensesResult.data ?? []) as unknown as ExpenseRowLite[];
  const splits = (splitsResult.data ?? []) as unknown as SplitRowLite[];
  const members = (membersResult.data ?? []) as unknown as MemberRowLite[];

  // BR-084 — only approved expenses count towards anybody's position.
  const approved = expenses.filter((expense) => expense.status === "approved");

  const paidByMember = new Map<string, number>();
  for (const expense of approved) {
    paidByMember.set(
      expense.paid_by_member_id,
      (paidByMember.get(expense.paid_by_member_id) ?? 0) + expense.amount_paise,
    );
  }

  const shareByMember = new Map<string, number>();
  for (const split of splits) {
    if (split.expenses?.status !== "approved") continue;
    shareByMember.set(
      split.member_id,
      (shareByMember.get(split.member_id) ?? 0) +
        split.share_paise +
        split.guest_share_paise,
    );
  }

  const categoryTotals = new Map<string, { icon: string | null; totalPaise: number }>();
  for (const expense of approved) {
    const name = expense.expense_categories?.name ?? "Other";
    const entry = categoryTotals.get(name) ?? {
      icon: expense.expense_categories?.icon ?? null,
      totalPaise: 0,
    };
    entry.totalPaise += expense.amount_paise;
    categoryTotals.set(name, entry);
  }

  // Anybody who paid or owes anything appears, former members included: they
  // still have to settle the month they were part of (BR-006).
  const position: PeriodPosition[] = members
    .filter(
      (member) =>
        member.status === "active" ||
        paidByMember.has(member.id) ||
        shareByMember.has(member.id),
    )
    .map((member) => {
      const paidPaise = paidByMember.get(member.id) ?? 0;
      const fairSharePaise = shareByMember.get(member.id) ?? 0;
      return {
        memberId: member.id,
        displayName: member.users?.display_name ?? "Someone",
        upiVpa: member.users?.upi_vpa ?? null,
        paidPaise,
        fairSharePaise,
        netPaise: paidPaise - fairSharePaise,
      };
    })
    .sort((a, b) => b.netPaise - a.netPaise);

  const monthEnd = endOfMonth(period);
  const houseToday = await currentHouseDate(session, houseId);

  return {
    period,
    periodId: periodResult.data?.id ?? null,
    status: periodResult.data?.status ?? "open",
    totalExpensePaise: approved.reduce((sum, expense) => sum + expense.amount_paise, 0),
    pendingApprovals: expenses.filter((expense) => expense.status === "pending_approval")
      .length,
    monthEnded: houseToday > monthEnd,
    reopenCount: periodResult.data?.reopen_count ?? 0,
    position,
    categoryTotals: [...categoryTotals.entries()]
      .map(([name, entry]) => ({ name, icon: entry.icon, totalPaise: entry.totalPaise }))
      .sort((a, b) => b.totalPaise - a.totalPaise),
  };
}

async function currentHouseDate(session: Session, houseId: string): Promise<string> {
  const { data } = await session.supabase
    .from("houses")
    .select("timezone")
    .eq("id", houseId)
    .single();

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: data?.timezone ?? "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export interface ClosePreview {
  balances: ComputedBalance[];
  payments: (Payment & { fromName: string; toName: string; upiLink: string | null })[];
  penalties: PenaltyRow[];
  checks: ReturnType<typeof checkSettlement>;
  blockers: string[];
}

/** The points behind the money — what a disputed penalty is answered with. */
export interface PenaltyRow {
  memberId: string;
  deficitPoints: number;
  surplusPoints: number;
  ratePaise: number;
  amountOwedPaise: number;
  amountCreditedPaise: number;
}

/**
 * Each member's carry over the weeks of a month — docs/06-ALGORITHMS.md 4.1.
 *
 * The weeks counted are those whose Monday falls inside the month. A week
 * straddling the boundary belongs wholly to the month it began in, so no week
 * is split between two settlements and none is counted twice.
 */
export async function monthCarry(
  session: Session,
  houseId: string,
  period: string,
): Promise<Map<string, number>> {
  const { data, error } = await session.supabase
    .from("effort_ledger")
    .select("member_id, carry_out")
    .eq("house_id", houseId)
    .gte("week_start", `${period}-01`)
    .lte("week_start", endOfMonth(period));

  if (error) throw apiErrorFromPostgres(error);

  const carry = new Map<string, number>();
  for (const row of data ?? []) {
    carry.set(row.member_id, (carry.get(row.member_id) ?? 0) + row.carry_out);
  }
  return carry;
}

/** The corrections this month has already been given, oldest first. */
async function periodAdjustments(
  session: Session,
  houseId: string,
  periodId: string,
): Promise<BalanceAdjustment[]> {
  const { data, error } = await session.supabase
    .from("balance_adjustments")
    .select("from_member_id, to_member_id, amount_paise")
    .eq("house_id", houseId)
    .eq("period_id", periodId)
    .order("created_at", { ascending: true });

  if (error) throw apiErrorFromPostgres(error);

  return (data ?? []).map((row) => ({
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amountPaise: row.amount_paise,
  }));
}

/**
 * What the close wizard shows before anything is committed.
 *
 * Nothing is written. The same computation runs again inside `closePeriod`, so
 * what somebody approved on the review screen is what gets stored.
 */
export async function previewClose(
  session: Session,
  houseId: string,
  period: string,
  options: { penaltyRatePaise: number; shadowMode?: boolean } = { penaltyRatePaise: 0 },
): Promise<ClosePreview> {
  const view = await getPeriodPosition(session, houseId, period);
  const nameById = new Map(view.position.map((row) => [row.memberId, row.displayName]));
  const vpaById = new Map(view.position.map((row) => [row.memberId, row.upiVpa]));

  // What each member ended the month owing or having spare, in points. This is
  // the number that becomes money (design decision 4), and it is the only place
  // effort touches the ledger.
  const carryByMember = await monthCarry(session, houseId, period);
  const carries = view.position.map((row) => ({
    memberId: row.memberId,
    carryPoints: carryByMember.get(row.memberId) ?? 0,
  }));

  // Shadow mode charges nothing while still showing the house what the rate
  // would have cost them. A month where everybody first sees a real penalty is
  // a month of arguments about the mechanism rather than about the work.
  const ratePaise = options.shadowMode ? 0 : options.penaltyRatePaise;
  const { owed, credit } = distributePenaltyPool(carries, ratePaise);

  // Corrections the Home already agreed by decision (migration 071). They are
  // folded in here rather than left to the effect, so the numbers on the review
  // screen are the numbers that get stored — and because an adjustment moves
  // money without creating any, the settlement still nets to zero.
  const balances = applyAdjustments(
    computeBalances(
      view.position.map((row) => ({
        memberId: row.memberId,
        paidPaise: row.paidPaise,
        fairSharePaise: row.fairSharePaise,
        penaltyOwedPaise: owed.get(row.memberId) ?? 0,
        penaltyCreditPaise: credit.get(row.memberId) ?? 0,
      })),
    ),
    view.periodId ? await periodAdjustments(session, houseId, view.periodId) : [],
  );

  const payments = minimiseTransfers(balances);
  const note = settlementNote(period);

  const penalties: PenaltyRow[] = carries.map((entry) => ({
    memberId: entry.memberId,
    deficitPoints: Math.max(0, -entry.carryPoints),
    surplusPoints: Math.max(0, entry.carryPoints),
    ratePaise,
    amountOwedPaise: owed.get(entry.memberId) ?? 0,
    amountCreditedPaise: credit.get(entry.memberId) ?? 0,
  }));

  const blockers: string[] = [];
  if (view.pendingApprovals > 0) {
    blockers.push(
      `${view.pendingApprovals} ${view.pendingApprovals === 1 ? "expense is" : "expenses are"} still waiting for approval`,
    );
  }
  if (!view.monthEnded) {
    blockers.push("The month has not finished yet");
  }
  if (view.status === "closed") {
    blockers.push("This month is already closed");
  }

  const checks = checkSettlement(balances, payments);
  if (!checks.netsToZero) {
    blockers.push(
      `The balances do not net to zero (off by ${checks.sumOfNetsPaise} paise). This is a defect — closing is blocked.`,
    );
  }

  // A penalty is a transfer, so the two sides must be equal to the paisa. The
  // database refuses the close on the same condition; catching it here is what
  // turns a raised exception into a sentence on the review screen.
  const owedTotal = penalties.reduce((sum, row) => sum + row.amountOwedPaise, 0);
  const creditedTotal = penalties.reduce(
    (sum, row) => sum + row.amountCreditedPaise,
    0,
  );
  if (owedTotal !== creditedTotal) {
    blockers.push(
      `Penalties owed (${owedTotal} paise) do not equal penalties credited (${creditedTotal} paise). This is a defect — closing is blocked.`,
    );
  }

  return {
    balances,
    penalties,
    payments: payments.map((payment) => ({
      ...payment,
      fromName: nameById.get(payment.fromMemberId) ?? "Someone",
      toName: nameById.get(payment.toMemberId) ?? "Someone",
      upiLink: buildUpiLink({
        payeeVpa: vpaById.get(payment.toMemberId) ?? null,
        payeeName: nameById.get(payment.toMemberId) ?? "Housemate",
        amountPaise: payment.amountPaise,
        note,
      }),
    })),
    checks,
    blockers,
  };
}

/** Closes the month. Everything is written in one transaction, or nothing is. */
export async function closePeriod(
  session: Session,
  houseId: string,
  period: string,
  options: { penaltyRatePaise: number; shadowMode?: boolean },
): Promise<{ status: string; preview: ClosePreview }> {
  const preview = await previewClose(session, houseId, period, options);

  if (preview.blockers.length > 0) {
    throw new ApiError("CLOSE_BLOCKED", { blockers: preview.blockers });
  }

  const { data: periodRow, error: periodError } = await session.supabase
    .from("monthly_periods")
    .select("id")
    .eq("house_id", houseId)
    .eq("period", period)
    .maybeSingle();

  if (periodError) throw apiErrorFromPostgres(periodError);
  if (!periodRow) throw new ApiError("NOT_FOUND", { period });

  const { data, error } = await session.supabase.rpc("close_period", {
    p_period_id: periodRow.id,
    p_balances: preview.balances.map((balance) => ({
      member_id: balance.memberId,
      total_paid_paise: balance.paidPaise,
      fair_share_paise: balance.fairSharePaise,
      expense_net_paise: balance.expenseNetPaise,
      penalty_owed_paise: balance.penaltyOwedPaise,
      penalty_credit_paise: balance.penaltyCreditPaise,
      final_net_paise: balance.finalNetPaise,
    })),
    p_settlements: preview.payments.map((payment) => ({
      from_member_id: payment.fromMemberId,
      to_member_id: payment.toMemberId,
      amount_paise: payment.amountPaise,
      upi_link: payment.upiLink,
    })),
    p_penalties: preview.penalties.map((row) => ({
      member_id: row.memberId,
      deficit_points: row.deficitPoints,
      surplus_points: row.surplusPoints,
      rate_paise: row.ratePaise,
      amount_owed_paise: row.amountOwedPaise,
      amount_credited_paise: row.amountCreditedPaise,
    })),
  });

  if (error) throw apiErrorFromPostgres(error);
  return { status: data as unknown as string, preview };
}

/**
 * The numbers `effect_close_settlement` is applied with (migration 071).
 *
 * D-59: closing a month is a Critical decision, and the roadmap is explicit
 * that the settlement rows are written **at apply time from apply-time
 * numbers**. So this runs when the last response lands, not when the close was
 * proposed — a month that gained an expense while the Home was answering is
 * closed on the month it actually had.
 *
 * The blockers are re-checked here for the same reason. If any of them holds
 * now, the effect refuses and the decision stays `approved` and unapplied,
 * which is the honest state and the one the specification asks for.
 */
export async function closeSettlementInput(
  session: Session,
  houseId: string,
  periodId: string,
  options: { shadowMode?: boolean } = {},
): Promise<Record<string, unknown>> {
  const { data: periodRow, error: lookupError } = await session.supabase
    .from("monthly_periods")
    .select("period")
    .eq("house_id", houseId)
    .eq("id", periodId)
    .maybeSingle();

  if (lookupError) throw apiErrorFromPostgres(lookupError);
  if (!periodRow) throw new ApiError("NOT_FOUND", { period: periodId });

  const settings = await session.supabase
    .from("house_settings")
    .select("penalty_rate_paise, penalty_enabled")
    .eq("house_id", houseId)
    .single();

  const preview = await previewClose(session, houseId, periodRow.period, {
    penaltyRatePaise: settings.data?.penalty_enabled
      ? (settings.data?.penalty_rate_paise ?? 0)
      : 0,
    shadowMode: options.shadowMode,
  });

  if (preview.blockers.length > 0) {
    throw new ApiError("CLOSE_BLOCKED", { blockers: preview.blockers });
  }

  return {
    balances: preview.balances.map((balance) => ({
      member_id: balance.memberId,
      total_paid_paise: balance.paidPaise,
      fair_share_paise: balance.fairSharePaise,
      expense_net_paise: balance.expenseNetPaise,
      penalty_owed_paise: balance.penaltyOwedPaise,
      penalty_credit_paise: balance.penaltyCreditPaise,
      final_net_paise: balance.finalNetPaise,
    })),
    settlements: preview.payments.map((payment) => ({
      from_member_id: payment.fromMemberId,
      to_member_id: payment.toMemberId,
      amount_paise: payment.amountPaise,
      upi_link: payment.upiLink,
    })),
    penalties: preview.penalties.map((row) => ({
      member_id: row.memberId,
      deficit_points: row.deficitPoints,
      surplus_points: row.surplusPoints,
      rate_paise: row.ratePaise,
      amount_owed_paise: row.amountOwedPaise,
      amount_credited_paise: row.amountCreditedPaise,
    })),
  };
}

export async function listSettlements(
  session: Session,
  houseId: string,
  period: string,
): Promise<SettlementView[]> {
  const { data, error } = await session.supabase
    .from("settlements")
    .select(
      `id, from_member_id, to_member_id, amount_paise, status, upi_link, is_delta,
       marked_paid_at, confirmed_at,
       payer:house_members!settlements_from_member_id_fkey ( users ( display_name ) ),
       payee:house_members!settlements_to_member_id_fkey ( users ( display_name ) ),
       monthly_periods!inner ( period )`,
    )
    .eq("house_id", houseId)
    .eq("monthly_periods.period", period)
    .order("amount_paise", { ascending: false });

  if (error) throw apiErrorFromPostgres(error);

  type Raw = {
    id: string;
    from_member_id: string;
    to_member_id: string;
    amount_paise: number;
    status: SettlementStatus;
    upi_link: string | null;
    is_delta: boolean;
    marked_paid_at: string | null;
    confirmed_at: string | null;
    payer: { users: { display_name: string } | null } | null;
    payee: { users: { display_name: string } | null } | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    fromMemberId: row.from_member_id,
    fromName: row.payer?.users?.display_name ?? "Someone",
    toMemberId: row.to_member_id,
    toName: row.payee?.users?.display_name ?? "Someone",
    amountPaise: row.amount_paise,
    status: row.status,
    upiLink: row.upi_link,
    isDelta: row.is_delta,
    markedPaidAt: row.marked_paid_at,
    confirmedAt: row.confirmed_at,
  }));
}

export async function markSettlementPaid(
  session: Session,
  settlementId: string,
  paid: boolean,
): Promise<string> {
  const { data, error } = await session.supabase.rpc("mark_settlement_paid", {
    p_settlement_id: settlementId,
    p_paid: paid,
  });
  if (error) throw apiErrorFromPostgres(error);
  return data as unknown as string;
}

export async function confirmSettlement(
  session: Session,
  settlementId: string,
): Promise<{ status: string; periodLocked: boolean }> {
  const { data, error } = await session.supabase.rpc("confirm_settlement", {
    p_settlement_id: settlementId,
  });
  if (error) throw apiErrorFromPostgres(error);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status:
      (row as { settlement_status_now?: string })?.settlement_status_now ?? "confirmed",
    periodLocked: Boolean((row as { period_locked: boolean })?.period_locked),
  };
}

export async function reopenPeriod(
  session: Session,
  houseId: string,
  period: string,
  reason: string,
): Promise<string> {
  const { data: periodRow, error: lookupError } = await session.supabase
    .from("monthly_periods")
    .select("id")
    .eq("house_id", houseId)
    .eq("period", period)
    .maybeSingle();

  if (lookupError) throw apiErrorFromPostgres(lookupError);
  if (!periodRow) throw new ApiError("NOT_FOUND", { period });

  const { data, error } = await session.supabase.rpc("reopen_period", {
    p_period_id: periodRow.id,
    p_reason: reason,
  });
  if (error) throw apiErrorFromPostgres(error);
  return data as unknown as string;
}
