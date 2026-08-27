import { jsonResponse, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deleteException, getException } from "@/lib/data/availability";

/**
 * DELETE /api/availability/exceptions/:id — withdraw a declared day.
 *
 * The chores are not pulled back. Somebody else has already been told they are
 * theirs, and taking work off a person who agreed to cover is a worse outcome
 * than a lightly under-loaded week for the returning member. They can claim
 * from the open pool if they want the points back.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;

    // RLS would refuse another member's row, but on a delete it refuses as a
    // silent no-op. Reading first turns that into an honest 404 or 403.
    const existing = await getException(session, house.id, id);
    if (!existing) throw new ApiError("NOT_FOUND");
    if (existing.memberId !== member.id) throw new ApiError("NOT_YOUR_RECORD");

    await deleteException(session, house.id, id);
    return jsonResponse({ id, deleted: true });
  },
);
