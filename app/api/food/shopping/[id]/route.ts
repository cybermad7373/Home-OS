import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deleteShoppingItem, updateShoppingItem } from "@/lib/data/food";
import { updateShoppingItemSchema } from "@/lib/validation/food";

/**
 * PATCH /api/food/shopping/:id — edit a field, or check/uncheck it off. RLS
 * lets any house member update, matching the "shared so the person shopping
 * sees what others have already marked" behaviour (section 13).
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { member } = await requireActiveMembership(session);
    const { id } = await context.params;
    const body = await parseBody(request, updateShoppingItemSchema);

    await updateShoppingItem(session, member.id, id, body);

    return jsonResponse({ ok: true });
  },
);

/** DELETE /api/food/shopping/:id — RLS restricts this to the creator or a lead. */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    await deleteShoppingItem(session, id);

    return jsonResponse({ ok: true });
  },
);
