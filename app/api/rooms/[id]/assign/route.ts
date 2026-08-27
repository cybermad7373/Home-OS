import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { assignRoom } from "@/lib/data/mutations";
import { assignRoomSchema } from "@/lib/validation/house";

/**
 * POST /api/rooms/:id/assign — admin only. Closes the member's previous
 * assignment with `to_date` and opens a new one (BR-011). Capacity is checked
 * by a database trigger (BR-010).
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireAdminMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, assignRoomSchema);
    const assignmentId = await assignRoom(
      session,
      id,
      input.member_id,
      input.from_date,
    );
    return jsonResponse({ id: assignmentId }, 201);
  },
);
