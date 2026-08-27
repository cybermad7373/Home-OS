import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { closePeriod, previewClose } from "@/lib/data/settlement";
import { closePeriodSchema } from "@/lib/validation/settlement";
import { paiseToRupeeString } from "@/lib/utils/money";

/**
 * GET /api/periods/:period/close — the dry run.
 *
 * Every member may see it. Closing a month is irreversible in practice, and the
 * house should be able to check the numbers before one person commits everybody
 * to them.
 */
export const GET = route(
  async (request: Request, context: { params: Promise<{ period: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { period } = await context.params;

    const shadow = new URL(request.url).searchParams.get("shadow") === "1";
    const settings = await session.supabase
      .from("house_settings")
      .select("penalty_rate_paise, penalty_enabled")
      .eq("house_id", house.id)
      .single();

    const preview = await previewClose(session, house.id, period, {
      // A house with the penalty switched off charges nothing, whatever rate
      // happens to be saved. Zeroing the rate here rather than branching later
      // keeps one code path: the arithmetic runs, and comes out at nil.
      penaltyRatePaise: settings.data?.penalty_enabled
        ? (settings.data?.penalty_rate_paise ?? 0)
        : 0,
      shadowMode: shadow,
    });

    return jsonResponse({
      period,
      can_close: preview.blockers.length === 0 && member.role === "admin",
      blockers: preview.blockers,
      balances: preview.balances.map((balance) => ({
        member_id: balance.memberId,
        paid: paiseToRupeeString(balance.paidPaise),
        fair_share: paiseToRupeeString(balance.fairSharePaise),
        penalty_owed: paiseToRupeeString(balance.penaltyOwedPaise),
        penalty_credit: paiseToRupeeString(balance.penaltyCreditPaise),
        final_net: paiseToRupeeString(balance.finalNetPaise),
        final_net_paise: balance.finalNetPaise,
      })),
      settlements: preview.payments.map((payment) => ({
        from: payment.fromName,
        from_member_id: payment.fromMemberId,
        to: payment.toName,
        to_member_id: payment.toMemberId,
        amount: paiseToRupeeString(payment.amountPaise),
        amount_paise: payment.amountPaise,
        upi_link: payment.upiLink,
      })),
      // The points behind the money. A member disputing a penalty is owed the
      // deficit and the rate, not just the total.
      penalties: preview.penalties
        .filter((row) => row.deficitPoints > 0 || row.surplusPoints > 0)
        .map((row) => ({
          member_id: row.memberId,
          deficit_points: row.deficitPoints,
          surplus_points: row.surplusPoints,
          rate: paiseToRupeeString(row.ratePaise),
          owed: paiseToRupeeString(row.amountOwedPaise),
          credited: paiseToRupeeString(row.amountCreditedPaise),
        })),
      checks: {
        nets_to_zero: preview.checks.netsToZero,
        transfer_count: preview.checks.transferCount,
        max_possible: preview.checks.maxPossible,
        reconciles: preview.checks.reconciles,
      },
    });
  },
);

/**
 * POST /api/periods/:period/close — admin only.
 *
 * Refuses while approvals are pending or the month is unfinished, and refuses
 * outright if the balances do not net to zero — that last one is a defect, not
 * a user error, and it must never be closed over.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ period: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { period } = await context.params;
    const input = await parseBody(request, closePeriodSchema);

    const settings = await session.supabase
      .from("house_settings")
      .select("penalty_rate_paise, penalty_enabled")
      .eq("house_id", house.id)
      .single();

    const result = await closePeriod(session, house.id, period, {
      // A house with the penalty switched off charges nothing, whatever rate
      // happens to be saved. Zeroing the rate here rather than branching later
      // keeps one code path: the arithmetic runs, and comes out at nil.
      penaltyRatePaise: settings.data?.penalty_enabled
        ? (settings.data?.penalty_rate_paise ?? 0)
        : 0,
      shadowMode: input.shadow_mode,
    });

    return jsonResponse({
      period,
      status: result.status,
      settlements: result.preview.payments.map((payment) => ({
        from: payment.fromName,
        to: payment.toName,
        amount: paiseToRupeeString(payment.amountPaise),
        upi_link: payment.upiLink,
      })),
      checks: {
        nets_to_zero: result.preview.checks.netsToZero,
        transfer_count: result.preview.checks.transferCount,
        max_possible: result.preview.checks.maxPossible,
      },
    });
  },
);
