import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listFoodPreferences, upsertFoodPreference } from "@/lib/data/food";
import { updateFoodPreferenceSchema } from "@/lib/validation/food";

/**
 * GET /api/food/preferences[?food=]
 *
 * The whole Home may read each other's ratings — that transparency is what
 * lets "liked by 6 of 7" render (section 5.1). A restriction never appears
 * here; it has its own, stricter endpoint.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const params = new URL(request.url).searchParams;

  return jsonResponse({
    preferences: await listFoodPreferences(session, house.id, params.get("food") ?? undefined),
  });
});

/**
 * POST /api/food/preferences — rate a food or an ingredient (section 5.1).
 *
 * Anyone can rate any meal or any food, at any time, and change their mind —
 * this is a standing opinion per person per food, not per meal instance, so
 * it always writes the one row for (member, food) or (member, item).
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, updateFoodPreferenceSchema);

  await upsertFoodPreference(session, house.id, member.id, body);

  return jsonResponse({ ok: true });
});
