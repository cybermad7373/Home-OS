import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { updateSettings } from "@/lib/data/mutations";
import { houseSettingsSchema } from "@/lib/validation/house";

/**
 * PATCH /api/houses/current/settings — admin only.
 *
 * SEC-03: checked here for a good error message, and again by the RLS policy
 * that only an admin satisfies.
 */
export const PATCH = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, houseSettingsSchema);
  const settings = await updateSettings(session, house.id, input);
  return jsonResponse(settings);
});
