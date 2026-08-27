import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { swapRequestSchema } from "@/lib/validation/chores";

/** POST /api/chores/:id/swap — ask somebody specific to take it. */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, swapRequestSchema);

    const { data, error } = await session.supabase.rpc("request_swap", {
      p_assignment_id: id,
      p_to_member_id: input.to_member_id,
      p_message: input.message ?? undefined,
    });

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id: data }, 201);
  },
);
