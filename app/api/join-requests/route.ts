import { jsonResponse, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { listJoinRequests } from "@/lib/data/homes";

/**
 * GET /api/join-requests — open requests for the selected Home. Lead only.
 *
 * An ordinary member sees the count through `GET /api/houses/current` and a
 * muted entry in the member list, and none of the detail here (HM-07).
 */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireLeadMembership(session);
  const requests = await listJoinRequests(session, house.id);
  return jsonResponse({
    requests: requests.map((item) => ({
      id: item.id,
      display_name: item.displayName,
      username: item.username,
      message: item.message,
      requested_at: item.requestedAt,
    })),
  });
});
