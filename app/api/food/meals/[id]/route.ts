import { jsonResponse, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deleteMeal, getMeal } from "@/lib/data/food";

/** GET /api/food/meals/:id — meal detail (S-44), items, participants, recipe. */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    const meal = await getMeal(session, id);
    if (!meal) throw new ApiError("MEAL_NOT_FOUND");

    return jsonResponse({ meal });
  },
);

/**
 * DELETE /api/food/meals/:id
 *
 * Deleting a meal leaves any linked expense intact — the link is a
 * reference, not ownership (FD-07). RLS restricts this to the meal's creator
 * or a lead.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    await deleteMeal(session, id);

    return jsonResponse({ ok: true });
  },
);
