import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireSession } from "@/lib/data/house";
import { inviteUrl } from "@/lib/data/homes";
import { createHouse } from "@/lib/data/mutations";
import { writeSelectedHouseId } from "@/lib/infra/supabase/selected-house";
import { createHouseSchema } from "@/lib/validation/house";

/**
 * POST /api/houses — create a Home. The caller becomes its Admin.
 *
 * The new Home becomes the caller's selected one, because creating a Home and
 * then being left looking at a different one is not a state anybody means to
 * be in.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const input = await parseBody(request, createHouseSchema);
  const { houseId, inviteCode, inviteToken } = await createHouse(session, {
    name: input.name,
    address: input.address || undefined,
    timezone: input.timezone,
    currency: input.currency,
    homeType: input.home_type,
    location: input.location
      ? {
          countryCode: input.location.country_code,
          state: input.location.state,
          city: input.location.city,
          area: input.location.area,
        }
      : undefined,
  });

  await writeSelectedHouseId(houseId);

  return jsonResponse(
    {
      id: houseId,
      role: "admin",
      invite_code: inviteCode,
      invite_url: inviteUrl(inviteToken),
    },
    201,
  );
});
