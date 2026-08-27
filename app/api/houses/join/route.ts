import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireSession } from "@/lib/data/house";
import { joinHouse } from "@/lib/data/mutations";
import { joinHouseSchema } from "@/lib/validation/house";

/**
 * POST /api/houses/join — join by invite code, creating a `pending` membership.
 * SEC-08: the code alone never grants access; an admin still approves.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { invite_code } = await parseBody(request, joinHouseSchema);
  const result = await joinHouse(session, invite_code);
  return jsonResponse(
    { status: result.status, house_name: result.houseName, house_id: result.houseId },
    202,
  );
});
