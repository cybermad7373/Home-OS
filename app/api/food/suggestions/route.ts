import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getSuggestions } from "@/lib/data/food";

/**
 * GET /api/food/suggestions[?mealType=]
 *
 * The library half of Try Today (section 6). Deterministic and always
 * available — the AI half is a separate, optional call site (section 6.2)
 * that never blocks this one.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const params = new URL(request.url).searchParams;
  const mealType = params.get("mealType") ?? "dinner";

  const result = await getSuggestions(session, house.id, member.id, mealType, house.state ?? null);

  return jsonResponse(result);
});
