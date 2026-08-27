import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import {
  listRooms,
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { createRoom } from "@/lib/data/mutations";
import { roomSchema } from "@/lib/validation/house";

/** GET /api/rooms — every room with its current occupants. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  return jsonResponse({ rooms: await listRooms(session, house.id) });
});

/** POST /api/rooms — admin only. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, roomSchema);
  return jsonResponse(await createRoom(session, house.id, input), 201);
});
