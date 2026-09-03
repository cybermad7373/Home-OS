import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getSuggestions } from "@/lib/data/food";
import { getFoodIdeas } from "@/lib/data/food-llm";

/**
 * GET /api/food/suggestions[?mealType=][&half=library|ai]
 *
 * Try Today (section 6): the library half (deterministic, always available)
 * and the AI half (section 6.2, optional) are two answers, not one. A failed
 * or disabled AI call answers `ai: null` — the library half renders alone,
 * which is the correct outcome and not an error (section 9.5).
 *
 * **`half` exists because the two used to be awaited together.** The provider
 * adapter allows 20 seconds and exactly one retry, so a model that was slow —
 * or rate-limited, which is what a free tier does under a test run — could hold
 * the deterministic half of the card off the screen for the better part of a
 * minute. The screen asks for the halves separately now: the library lands
 * immediately and the model's ideas fill in beside it whenever they arrive.
 * Without the parameter the response still carries both, so an old client and
 * `GET /api/food/suggestions` in a script keep working.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const params = new URL(request.url).searchParams;
  const mealType = params.get("mealType") ?? "dinner";
  const half = params.get("half");

  const home = {
    id: house.id,
    city: house.city,
    state: house.state,
    country_code: house.country_code,
  };

  if (half === "ai") {
    return jsonResponse({ ai: await getFoodIdeas(session, home, member.id, mealType) });
  }

  const library = await getSuggestions(
    session,
    house.id,
    member.id,
    mealType,
    house.state ?? null,
  );

  if (half === "library") return jsonResponse({ library });

  return jsonResponse({
    library,
    ai: await getFoodIdeas(session, home, member.id, mealType),
  });
});
