import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { deleteRoom, updateRoom } from "@/lib/data/mutations";
import { roomUpdateSchema } from "@/lib/validation/house";

/** PATCH /api/rooms/:id — admin only. */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireAdminMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, roomUpdateSchema);
    return jsonResponse(await updateRoom(session, house.id, id, input));
  },
);

/** DELETE /api/rooms/:id — soft, and refused while occupied (BR-012). */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireAdminMembership(session);
    const { id } = await context.params;
    await deleteRoom(session, id);
    return jsonResponse({ deleted: true });
  },
);
