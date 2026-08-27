import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listPendingApprovals } from "@/lib/data/expenses";

/** GET /api/expenses/pending — everything awaiting the caller's approval. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const expenses = await listPendingApprovals(session, house.id, member.id);
  return jsonResponse({ expenses });
});
