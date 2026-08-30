import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { proposeDecision } from "@/lib/data/governance";
import { reopenPeriodSchema } from "@/lib/validation/settlement";
import { findPeriod } from "@/lib/data/settlement";

/**
 * POST /api/periods/:period/reopen — proposes the reopen.
 *
 * Reopening a settled month reopens the argument that closing it ended, so it
 * is deliberate, counted, and carries a reason (BR-112, BR-113). Since D-59 it
 * is also the Home's decision rather than one Admin's: the Admin is still the
 * only member who may ask, and the answer belongs to everybody whose money is
 * being unsettled.
 *
 * What was already paid is not thrown away. The balances and the confirmed
 * settlements stay where they are, and the next close issues deltas against
 * them.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ period: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireAdminMembership(session);
    const { period } = await context.params;
    const { reason } = await parseBody(request, reopenPeriodSchema);

    const periodRow = await findPeriod(session, house.id, period);
    if (!periodRow) throw new ApiError("NOT_FOUND", { period });

    // Asked here as well as in the effect. A Home should not spend a day
    // answering a question about a month that was never closed.
    if (periodRow.status === "open") {
      throw new ApiError("PERIOD_ALREADY_OPEN", { period });
    }

    const result = await proposeDecision(session, house.id, member.id, {
      type: "reopen_settlement",
      subject_type: "period",
      subject_id: periodRow.id,
      payload: { period, reason },
      reason,
    });

    return jsonResponse(
      {
        period,
        decision: result.decision,
        applied: result.applied,
        apply_refusal: result.applyRefusal,
      },
      201,
    );
  },
);
