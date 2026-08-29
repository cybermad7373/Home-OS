import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deleteMealPlan } from "@/lib/data/food";

/**
 * DELETE /api/food/plans/:id
 *
 * An unconfirmed plan whose date has passed is dropped from the Calendar and
 * never becomes history (section 11) — this is that drop, and it is also
 * what a member does to cancel a plan outright. Deleting a plan never deletes
 * the meal it may have already been confirmed into.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    await deleteMealPlan(session, id);

    return jsonResponse({ ok: true });
  },
);
