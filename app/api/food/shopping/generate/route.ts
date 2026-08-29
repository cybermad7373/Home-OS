import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { generateShoppingItems } from "@/lib/data/food";

/**
 * POST /api/food/shopping/generate — "Generate from meals" (S-53). Reads the
 * next 7 days of unconfirmed plans and adds whatever ingredient isn't already
 * on the list. Idempotent: a second press with nothing new adds nothing.
 */
export const POST = route(async () => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);

  const added = await generateShoppingItems(session, house.id, member.id);

  return jsonResponse({ added });
});
