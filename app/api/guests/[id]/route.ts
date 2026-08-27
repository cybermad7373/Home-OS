import { jsonResponse, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deleteGuest, getGuest } from "@/lib/data/guests";

/**
 * DELETE /api/guests/:id — the host cancels a stay, or an admin corrects one.
 *
 * Splits already computed are untouched. They were computed once, at creation,
 * against the head count as it stood (D-02), and cancelling a visit that has
 * already been paid for does not un-eat the food.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;

    const guest = await getGuest(session, house.id, id);
    if (!guest) throw new ApiError("NOT_FOUND");
    if (guest.hostMemberId !== member.id && member.role !== "admin") {
      throw new ApiError("NOT_YOUR_RECORD");
    }

    await deleteGuest(session, house.id, id);
    return jsonResponse({ id, deleted: true });
  },
);
