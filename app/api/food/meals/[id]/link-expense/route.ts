import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { linkMealToExpense, unlinkMealFromExpense } from "@/lib/data/food";
import { linkMealExpenseSchema } from "@/lib/validation/food";

/**
 * POST /api/food/meals/:id/link-expense — the "Link to a meal" chip's other
 * direction. Optional, both directions, never required (FD-07). Voiding or
 * deleting either side leaves the other intact — this only ever sets a
 * reference, it never cascades.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const body = await parseBody(request, linkMealExpenseSchema);

    await linkMealToExpense(session, id, body.expenseId);

    return jsonResponse({ ok: true });
  },
);

/** DELETE /api/food/meals/:id/link-expense — removes the reference, nothing else. */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;

    await unlinkMealFromExpense(session, id);

    return jsonResponse({ ok: true });
  },
);
