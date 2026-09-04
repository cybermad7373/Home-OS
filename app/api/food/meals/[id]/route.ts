import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deleteMeal, getMeal, updateMeal } from "@/lib/data/food";
import { updateMealSchema } from "@/lib/validation/food";

/** GET /api/food/meals/:id — meal detail (S-45), items, participants, recipe. */
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

/**
 * PATCH /api/food/meals/:id — correct a recorded meal (S-45).
 *
 * Narrower than recording one, deliberately. The name, the date, the source,
 * the type, the four cost components, the note and the recipe are corrections
 * somebody makes when they mistyped. Participants and items are not editable:
 * changing who ate a meal after the fact changes a per-person figure the Home
 * may already have settled an expense against, and doing that silently is worse
 * than making somebody delete the meal and record it again.
 *
 * Who may edit is the `meals_update` policy's decision — the creator or a
 * lead — not this handler's. It returns the meal as it now stands, so a caller
 * never has to guess what the trigger did to the total.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, updateMealSchema);

    // Read first, so a meal in another house is a 404 rather than an update
    // that silently affects no rows and reports success.
    const existing = await getMeal(session, id);
    if (!existing) throw new ApiError("MEAL_NOT_FOUND");

    await updateMeal(session, id, input);

    const meal = await getMeal(session, id);
    return jsonResponse({ meal });
  },
);
