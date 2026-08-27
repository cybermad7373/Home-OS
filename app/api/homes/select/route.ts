import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireSession } from "@/lib/data/house";
import { assertSelectable } from "@/lib/data/homes";
import { writeSelectedHouseId } from "@/lib/infra/supabase/selected-house";
import { selectHomeSchema } from "@/lib/validation/house";

/**
 * POST /api/homes/select — set the caller's selected Home for this session.
 *
 * The only place the selection is written. Everywhere else the Home is derived
 * from it and re-checked against the caller's memberships, so this is the one
 * request in the app that names a Home, and the one that has to refuse.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house_id } = await parseBody(request, selectHomeSchema);
  await assertSelectable(session, house_id);
  await writeSelectedHouseId(house_id);
  return jsonResponse({ selected_house_id: house_id });
});
