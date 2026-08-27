import { jsonResponse, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";

/**
 * POST /api/chores/:id/claim — take one out of the pool.
 *
 * The status check happens inside the UPDATE, so two people tapping claim in
 * the same instant cannot both succeed; the second gets ALREADY_CLAIMED.
 */
export const POST = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    const { data, error } = await session.supabase.rpc("claim_chore", {
      p_assignment_id: id,
    });

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id, status: data });
  },
);
