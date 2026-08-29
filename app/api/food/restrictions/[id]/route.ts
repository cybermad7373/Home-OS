import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deleteRestriction } from "@/lib/data/food";

/**
 * DELETE /api/food/restrictions/:id — reversible any time, by the person or
 * their guardian (section 5.2a). RLS is the enforcement.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    await deleteRestriction(session, id);

    return jsonResponse({ ok: true });
  },
);
