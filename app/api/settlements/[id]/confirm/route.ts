import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { confirmSettlement } from "@/lib/data/settlement";

/**
 * POST /api/settlements/:id/confirm — the receiver confirms the money arrived.
 *
 * BR-105: when the last settlement in the period is confirmed, the period moves
 * to `closed` and locks. That transition is the moment the month becomes
 * immutable, which is why it is driven by the people who were owed rather than
 * by a timer.
 */
export const POST = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    const result = await confirmSettlement(session, id);
    return jsonResponse({ id, status: result.status, period_locked: result.periodLocked });
  },
);
