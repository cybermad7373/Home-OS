import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireSession } from "@/lib/data/house";
import { createHouse } from "@/lib/data/mutations";
import { createHouseSchema } from "@/lib/validation/house";

/** POST /api/houses — create a house. The caller becomes its admin. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const input = await parseBody(request, createHouseSchema);
  const { houseId, inviteCode } = await createHouse(session, {
    name: input.name,
    address: input.address || undefined,
    timezone: input.timezone,
    currency: input.currency,
    householdType: input.household_type,
  });
  return jsonResponse({ id: houseId, invite_code: inviteCode, role: "admin" }, 201);
});
