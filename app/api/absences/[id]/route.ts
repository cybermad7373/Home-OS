import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { withdrawAbsence } from "@/lib/data/absence";

/**
 * DELETE /api/absences/:id — withdraw a request nobody has answered yet.
 *
 * Only your own, and only while it is waiting. It cancels the decision rather
 * than the request row: the decision is what people were asked, and a live
 * question about a request that no longer exists is the one state this must
 * not be able to produce.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;

    return jsonResponse({
      absence: await withdrawAbsence(session, house.id, id, member.id),
    });
  },
);
