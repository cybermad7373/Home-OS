import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { respondToDecision } from "@/lib/data/governance";
import { respondSchema } from "@/lib/validation/governance";

/**
 * POST /api/decisions/:id/respond — approve, acknowledge, or reject.
 *
 * The response is the only write a browser makes in this subsystem. If it
 * completes the decision, the server applies the effect with the service-role
 * key — `apply_decision` is granted to nobody else — and reports whether it
 * ran. A rejection needs a reason of at least ten characters, in the schema
 * here and in a check constraint there.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;
    const body = await parseBody(request, respondSchema);

    const result = await respondToDecision(session, house.id, id, member.id, body);

    return jsonResponse({
      decision: result.decision,
      applied: result.applied,
      apply_refusal: result.applyRefusal,
    });
  },
);
