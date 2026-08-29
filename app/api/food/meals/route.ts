import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { createMeal, listMeals } from "@/lib/data/food";
import { createMealSchema } from "@/lib/validation/food";

/**
 * GET /api/food/meals[?from=&to=&limit=]
 *
 * The Home's food history. Everyone sees everyone's — food is not the money
 * flow, there is no privacy boundary here the way there is on a restriction.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const params = new URL(request.url).searchParams;

  return jsonResponse({
    meals: await listMeals(session, house.id, {
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    }),
  });
});

/**
 * POST /api/food/meals — Add Meal (section 8.1).
 *
 * A name and a date is a valid meal. Everything else — participants, cost,
 * items, the library save, meal type, a link to an expense — is optional and
 * defaulted. Recording food is never mandatory and this endpoint never
 * touches the money flow on its own (FD-06, FD-08).
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const body = await parseBody(request, createMealSchema);

  const mealId = await createMeal(session, house.id, body);

  return jsonResponse({ mealId }, 201);
});
