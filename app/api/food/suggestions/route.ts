import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getSuggestions } from "@/lib/data/food";
import { getFoodIdeas } from "@/lib/data/food-llm";

/**
 * GET /api/food/suggestions[?mealType=]
 *
 * Try Today (section 6): the library half (deterministic, always available)
 * and the AI half (section 6.2, optional) run in parallel. A failed or
 * disabled AI call answers `ai: null` — the library half renders alone, which
 * is the correct outcome and not an error (section 9.5).
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const params = new URL(request.url).searchParams;
  const mealType = params.get("mealType") ?? "dinner";

  const [library, ai] = await Promise.all([
    getSuggestions(session, house.id, member.id, mealType, house.state ?? null),
    getFoodIdeas(
      session,
      { id: house.id, city: house.city, state: house.state, country_code: house.country_code },
      member.id,
      mealType,
    ),
  ]);

  return jsonResponse({ library, ai });
});
