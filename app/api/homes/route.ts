import { jsonResponse, route } from "@/lib/api/handler";
import { requireSession } from "@/lib/data/house";
import { listHomes } from "@/lib/data/homes";
import { readSelectedHouseId } from "@/lib/infra/supabase/selected-house";

/**
 * GET /api/homes — every Home the caller is Active in, plus any Requested ones.
 *
 * A Requested row carries `role: null` and nothing else about that Home
 * (docs/05-API-SPEC.md section 2.1).
 */
export const GET = route(async () => {
  const session = await requireSession();
  const selected = await readSelectedHouseId();
  const view = await listHomes(session, selected);
  return jsonResponse({
    selected_house_id: view.selectedHouseId,
    homes: view.homes.map((home) => ({
      id: home.id,
      name: home.name,
      home_type: home.homeType,
      role: home.role,
      status: home.status,
      pending_count: home.pendingCount,
    })),
  });
});
