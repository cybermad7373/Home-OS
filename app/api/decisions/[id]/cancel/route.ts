import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { cancelDecision } from "@/lib/data/governance";

/**
 * POST /api/decisions/:id/cancel — the proposer withdraws.
 *
 * Only the proposer, and only while it is waiting. A lead cannot cancel
 * somebody else's proposal: that would be one person deciding an approval,
 * wearing the word "cancel". The database enforces this too.
 */
export const POST = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;
    const decision = await cancelDecision(session, house.id, id, member.id);
    return jsonResponse({ decision });
  },
);
