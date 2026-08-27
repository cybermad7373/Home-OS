import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { voidExpense } from "@/lib/data/expenses";
import { voidExpenseSchema } from "@/lib/validation/expenses";

/**
 * POST /api/expenses/:id/void — payer or admin, open period only.
 *
 * BR-091: the record survives with its reason. Deleting it would leave the
 * month's total unexplained, which is exactly the argument this app exists to
 * prevent.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const { reason } = await parseBody(request, voidExpenseSchema);

    await voidExpense(session, id, reason);
    return jsonResponse({ id, status: "void" });
  },
);
