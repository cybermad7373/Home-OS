import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { mergeFoods } from "@/lib/data/food";
import { mergeFoodsSchema } from "@/lib/validation/food";

/**
 * POST /api/food/library/merge — Admin/Co-Admin only (section 4.1).
 *
 * Rewrites every reference from the source entry to the target and keeps both
 * original names in History. `merge_food_entries` enforces the lead check
 * itself, so a non-lead caller gets LEAD_REQUIRED from the database.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await requireActiveMembership(session);
  const body = await parseBody(request, mergeFoodsSchema);

  await mergeFoods(session, body.sourceId, body.targetId);

  return jsonResponse({ ok: true });
});
