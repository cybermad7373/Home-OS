import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { rejectChoreSchema } from "@/lib/validation/chores";

/**
 * POST /api/chores/:id/reject — a peer says it was not done properly.
 *
 * One retry, with the deadline pushed a day. A second failure is a miss and
 * earns nothing. The reason is mandatory: a rejection without one is a veto,
 * and vetoes are what this whole mechanism exists to prevent.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const { reason } = await parseBody(request, rejectChoreSchema);

    const { data, error } = await session.supabase.rpc("reject_chore", {
      p_assignment_id: id,
      p_reason: reason,
    });

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id, status: data });
  },
);
