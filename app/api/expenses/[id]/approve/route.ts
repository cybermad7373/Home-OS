import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { approveExpense } from "@/lib/data/expenses";
import { approveExpenseSchema } from "@/lib/validation/expenses";

/**
 * POST /api/expenses/:id/approve — approve or reject.
 *
 * BR-086, one approval is enough. BR-085, never your own: refused by the
 * function, and again by a check constraint on the table if it ever got past.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, approveExpenseSchema);

    const status = await approveExpense(session, id, input.approve, input.reason);
    return jsonResponse({ id, status });
  },
);
