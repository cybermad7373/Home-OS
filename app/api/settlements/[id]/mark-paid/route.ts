import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { markSettlementPaid } from "@/lib/data/settlement";
import { markPaidSchema } from "@/lib/validation/settlement";

/**
 * POST /api/settlements/:id/mark-paid — the payer asserts they have paid.
 *
 * BR-109, BR-110: only the payer, and they may take it back until the receiver
 * confirms. The app never decides this for itself — it has no way to know
 * whether money actually moved, and pretending otherwise would make every
 * balance a guess.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireActiveMembership(session);
    const { id } = await context.params;
    const { paid } = await parseBody(request, markPaidSchema);

    const status = await markSettlementPaid(session, id, paid);
    return jsonResponse({ id, status });
  },
);
