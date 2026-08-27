import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { swapResponseSchema } from "@/lib/validation/chores";

/** POST /api/swaps/:id/respond — accept or decline. */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const { accept } = await parseBody(request, swapResponseSchema);

    const { data, error } = await session.supabase.rpc("respond_to_swap", {
      p_swap_id: id,
      p_accept: accept,
    });

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id, status: data });
  },
);
