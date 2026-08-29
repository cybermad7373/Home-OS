import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { attachChoreDetailsSchema } from "@/lib/validation/chores";

/**
 * POST /api/chores/:id/attach — a photo or a note, added after the tap
 * (CE-12, S-12). Never a gate in front of marking done, and open only while
 * the instance has not moved past `done_pending`.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const { photo_url, note } = await parseBody(request, attachChoreDetailsSchema);

    const { data, error } = await session.supabase.rpc("attach_chore_details", {
      p_assignment_id: id,
      p_photo_url: photo_url ?? undefined,
      p_note: note ?? undefined,
    });

    if (error) throw apiErrorFromPostgres(error);
    return jsonResponse({ id, status: data });
  },
);
