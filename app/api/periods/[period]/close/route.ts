import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { proposeDecision } from "@/lib/data/governance";
import { previewClose } from "@/lib/data/settlement";
import { closePeriodSchema } from "@/lib/validation/settlement";
import { paiseToRupeeString } from "@/lib/utils/money";
import { findPeriod, getPenaltySettings } from "@/lib/data/settlement";

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
    const penalty = await getPenaltySettings(session, house.id);

    const preview = await previewClose(session, house.id, period, {
      penaltyRatePaise: penalty.ratePaise,
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
 * POST /api/periods/:period/close — proposes the close.
 *
 * D-59 moved this behind the governance engine. An Admin still asks, and the
 * same three refusals still apply before anybody is asked to answer — pending
 * approvals, an unfinished month, balances that do not net to zero — because a
 * question the Home cannot act on is not worth putting to them.
 *
 * What changed is what happens after: the handler proposes, the Home answers,
 * and the money is written at apply time from apply-time numbers. Nothing here
 * closes anything. A one-person Home is the documented exception and comes back
 * from `proposeDecision` already applied.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ period: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireAdminMembership(session);
    const { period } = await context.params;
    const input = await parseBody(request, closePeriodSchema);

    const penalty = await getPenaltySettings(session, house.id);

    // A dry run of exactly the arithmetic the effect will be applied with, so
    // that a month which cannot be closed is refused here rather than after the
    // Home has spent a day answering.
    const preview = await previewClose(session, house.id, period, {
      penaltyRatePaise: penalty.ratePaise,
      shadowMode: input.shadow_mode,
    });

    if (preview.blockers.length > 0) {
      throw new ApiError("CLOSE_BLOCKED", { blockers: preview.blockers });
    }

    const periodRow = await findPeriod(session, house.id, period);
    if (!periodRow) throw new ApiError("NOT_FOUND", { period });

    const result = await proposeDecision(session, house.id, member.id, {
      type: "close_settlement",
      subject_type: "period",
      subject_id: periodRow.id,
      // Read at apply time by the effect and by nothing else. The money is not
      // in here: it is computed again when the last response lands.
      payload: { period, shadow_mode: input.shadow_mode },
      reason: input.reason ?? `Closing ${period}`,
    });

    return jsonResponse(
      {
        period,
        decision: result.decision,
        applied: result.applied,
        apply_refusal: result.applyRefusal,
        // What the Home is being asked to agree to. The stored rows are
        // recomputed at apply time, so this is a preview and says so.
        preview: {
          settlements: result.applied
            ? []
            : preview.payments.map((payment) => ({
                from: payment.fromName,
                to: payment.toName,
                amount: paiseToRupeeString(payment.amountPaise),
                upi_link: payment.upiLink,
              })),
          checks: {
            nets_to_zero: preview.checks.netsToZero,
            transfer_count: preview.checks.transferCount,
            max_possible: preview.checks.maxPossible,
          },
        },
      },
      201,
    );
  },
);
