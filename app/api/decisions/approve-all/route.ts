import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { approveAll } from "@/lib/data/governance";

/**
 * POST /api/decisions/approve-all — one tap for everything the caller may
 * legitimately batch (docs/14-GOVERNANCE-SPEC.md §5).
 *
 * It takes no body. The batch is planned on the server from the same function
 * that produced the count on the button, and a Critical decision that would
 * complete on this caller's tap is excluded and shown on its own. There is no
 * Reject All: a rejection needs a reason, and a batch of identical reasons is
 * not a reason.
 */
export const POST = route(async () => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const result = await approveAll(session, house.id, member.id);
  return jsonResponse(result);
});
