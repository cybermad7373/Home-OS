import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listOpenPool } from "@/lib/data/chores";

/** GET /api/chores/pool — chores nobody is holding, free to claim. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  return jsonResponse({ assignments: await listOpenPool(session, house.id) });
});
