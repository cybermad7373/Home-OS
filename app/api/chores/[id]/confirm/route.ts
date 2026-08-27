import { jsonResponse, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";

/**
 * POST /api/chores/:id/confirm — a peer confirms, and the points post.
 *
 * Self-confirmation is refused by the function and again by a check constraint
 * on the table. Points post exactly once, by trigger, on the transition into
 * confirmed — nothing else in the system writes the effort ledger.
 */
export const POST = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    const { data, error } = await session.supabase.rpc("confirm_chore", {
      p_assignment_id: id,
    });

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id, status: data });
  },
);
