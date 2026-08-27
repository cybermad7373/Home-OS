import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getPeriodPosition, listSettlements } from "@/lib/data/settlement";
import { houseToday } from "@/lib/utils/date";
import { paiseToRupeeString } from "@/lib/utils/money";

/**
 * GET /api/periods/current?period=2026-08 — where the month stands.
 *
 * Everybody may read this, not only the admin. The projected position is the
 * warning that makes the close unsurprising, and a warning only one person can
 * see is not a warning.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const requested = new URL(request.url).searchParams.get("period");
  const period = requested ?? houseToday(house.timezone).slice(0, 7);

  const [view, settlements] = await Promise.all([
    getPeriodPosition(session, house.id, period),
    listSettlements(session, house.id, period),
  ]);

  return jsonResponse({
    period: view.period,
    status: view.status,
    total_expense: paiseToRupeeString(view.totalExpensePaise),
    total_expense_paise: view.totalExpensePaise,
    pending_approvals: view.pendingApprovals,
    month_ended: view.monthEnded,
    reopen_count: view.reopenCount,
    position: view.position.map((row) => ({
      member_id: row.memberId,
      name: row.displayName,
      paid: paiseToRupeeString(row.paidPaise),
      fair_share: paiseToRupeeString(row.fairSharePaise),
      net: paiseToRupeeString(row.netPaise),
      net_paise: row.netPaise,
    })),
    category_totals: view.categoryTotals,
    settlements,
    // Effort penalties arrive with the chore engine. The field exists now and
    // computes to zero, so nothing downstream has to change when it fills in.
    projected_penalties: [],
  });
});
