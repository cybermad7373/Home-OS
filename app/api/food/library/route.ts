import { z } from "zod";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { createFoodLibraryEntry, listFoods } from "@/lib/data/food";
import { mealSourceSchema } from "@/lib/validation/food";

/** GET /api/food/library — the Home's active library entries (S-45). */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  return jsonResponse({ foods: await listFoods(session, house.id) });
});

const createFoodSchema = z.object({
  name: z.string().trim().min(1, "Name it").max(120),
  defaultSource: mealSourceSchema.optional(),
  recipeInstructions: z.string().trim().max(4000).optional(),
});

/**
 * POST /api/food/library — a standalone library entry.
 *
 * Available to any member, not only a lead — the Add Meal form's "Save to
 * Home Food Library?" checkbox is what usually calls this, and that flow is
 * open to everyone (section 4). Merging or renaming an existing entry is the
 * lead-only action, at POST /api/food/library/merge.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, createFoodSchema);

  const foodId = await createFoodLibraryEntry(session, house.id, member.id, body);

  return jsonResponse({ foodId }, 201);
});
