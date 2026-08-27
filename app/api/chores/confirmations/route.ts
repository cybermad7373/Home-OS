import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listAwaitingConfirmation } from "@/lib/data/chores";

/**
 * GET /api/chores/confirmations — chores waiting on the caller to confirm.
 *
 * Their own are excluded: nobody confirms their own work, so it is not awaiting
 * them. A stalled queue here is the failure mode that breaks the mechanism,
 * which is why it has its own surface rather than living inside the week view.
 */
export const GET = route(async () => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const assignments = await listAwaitingConfirmation(session, house.id, member.id);
  return jsonResponse({ assignments });
});
