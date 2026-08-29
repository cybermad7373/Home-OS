import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { createMealPlan, listMealPlans } from "@/lib/data/food";
import { createMealPlanSchema } from "@/lib/validation/food";

/** GET /api/food/plans[?from=&to=] — intentions on the Calendar (S-52), not history. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const params = new URL(request.url).searchParams;

  return jsonResponse({
    plans: await listMealPlans(session, house.id, {
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    }),
  });
});

/**
 * POST /api/food/plans — the Plan It action (section 11, FD-20).
 *
 * An intention, not a record: no cost, no participants, no preference signal
 * until it is confirmed as eaten at POST /api/food/plans/:id/confirm.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, createMealPlanSchema);

  const planId = await createMealPlan(session, house.id, member.id, body);

  return jsonResponse({ planId }, 201);
});
