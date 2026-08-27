import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { markDoneSchema } from "@/lib/validation/chores";

/**
 * POST /api/chores/:id/done — the assignee says they did it.
 *
 * No points move yet. They move on confirmation, which somebody else gives, or
 * automatically after the house's auto-confirm window.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const { photo_url } = await parseBody(request, markDoneSchema);

    const { data, error } = await session.supabase.rpc("mark_chore_done", {
      p_assignment_id: id,
      p_photo_url: photo_url ?? undefined,
    });

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id, status: data });
  },
);
