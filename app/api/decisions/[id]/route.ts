import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getDecision } from "@/lib/data/governance";

/**
 * GET /api/decisions/:id — one decision, with who was asked and who has answered.
 *
 * `viewer` carries what this caller may do with it: whether they may respond,
 * in which capacity, and whether their response would complete it. That last
 * flag is what makes a Critical decision show its full effect before it is
 * answered rather than after (AP-04).
 */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;
    const decision = await getDecision(session, house.id, id, member.id);
    return jsonResponse({ decision });
  },
);
