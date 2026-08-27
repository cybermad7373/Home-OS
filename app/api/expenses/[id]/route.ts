import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getExpense } from "@/lib/data/expenses";

/** GET /api/expenses/:id — one expense with its full split. */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { member } = await requireActiveMembership(session);
    const { id } = await context.params;
    return jsonResponse(await getExpense(session, id, member.id));
  },
);
