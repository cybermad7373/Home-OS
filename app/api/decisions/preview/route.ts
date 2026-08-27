import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { previewProposal } from "@/lib/data/governance";
import { previewDecisionSchema } from "@/lib/validation/governance";

/**
 * POST /api/decisions/preview — who would be asked, before anybody is.
 *
 * S-37 shows the cost of asking before the ask: the people, their capacities,
 * how many responses it needs and how long they have. It writes nothing, and
 * it runs the same selector the proposal will, so the sheet cannot promise a
 * list the proposal would not produce.
 *
 * A POST because the answer depends on a body rather than on a path, and
 * because a preview of a decision about a member should not put that member's
 * id in a URL that gets logged. Its refusals are the proposal's refusals —
 * a Home that cannot decide this is told so here rather than at Submit.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, previewDecisionSchema);

  const preview = await previewProposal(session, house.id, member.id, body);

  return jsonResponse(preview);
});
