import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { createShoppingItem, listShoppingItems } from "@/lib/data/food";
import { createShoppingItemSchema } from "@/lib/validation/food";

/** GET /api/food/shopping — the Home's shopping list (S-53). */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  return jsonResponse({ items: await listShoppingItems(session, house.id) });
});

/** POST /api/food/shopping — a manually added item, name only required. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, createShoppingItemSchema);

  const itemId = await createShoppingItem(session, house.id, member.id, body);

  return jsonResponse({ itemId }, 201);
});
