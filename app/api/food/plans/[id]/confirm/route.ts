import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { confirmMealPlan } from "@/lib/data/food";
import { confirmMealPlanSchema } from "@/lib/validation/food";

/**
 * POST /api/food/plans/:id/confirm — the only moment a plan becomes a record
 * (section 11). Every ordinary rule applies from here: participants,
 * per-person cost, the library offer, the preference vote, the optional
 * expense link. Refused if the plan is already confirmed.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireActiveMembership(session);
    const { id } = await context.params;
    const body = await parseBody(request, confirmMealPlanSchema);

    const mealId = await confirmMealPlan(session, house.id, id, body);

    return jsonResponse({ mealId });
  },
);
