import { jsonResponse, route } from "@/lib/api/handler";
import { getHouseContext, requireSession } from "@/lib/data/house";

/** GET /api/houses/current — the full house context for the caller. */
export const GET = route(async () => {
  const session = await requireSession();
  const context = await getHouseContext(session);
  return jsonResponse(context);
});
