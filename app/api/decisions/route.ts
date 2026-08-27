import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listDecisions, proposeDecision } from "@/lib/data/governance";
import {
  decisionQuerySchema,
  proposeDecisionSchema,
} from "@/lib/validation/governance";

/**
 * GET /api/decisions — the Home's queue, and what Approve All would act on.
 *
 * Every member sees every decision at every status. Transparency is the point
 * of the record (docs/14-GOVERNANCE-SPEC.md §3): a decision only the people
 * asked can see is an admin action with extra steps. `scope=mine` narrows it
 * to the ones still waiting on the caller, which is the Approvals surface.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);

  const url = new URL(request.url);
  const query = decisionQuerySchema.parse({
    status: url.searchParams.get("status") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
  });

  const view = await listDecisions(session, house.id, member.id, {
    status: query.status,
    scope: query.scope,
  });

  return jsonResponse(view);
});

/**
 * POST /api/decisions — propose one.
 *
 * The participants are chosen by the domain selector and validated by the
 * database, which refuses a list this handler could not have produced (D-54).
 * Two outcomes are ordinary rather than exceptional: a one-person Home
 * approves on the spot and the row says `auto_approved`, and a decision whose
 * effect is not built yet stays `approved` with `applied: false` and a named
 * refusal rather than failing the request.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, proposeDecisionSchema);

  const result = await proposeDecision(session, house.id, member.id, body);

  return jsonResponse(
    {
      decision: result.decision,
      applied: result.applied,
      apply_refusal: result.applyRefusal,
    },
    201,
  );
});
