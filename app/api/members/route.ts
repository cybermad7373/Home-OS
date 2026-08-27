import { jsonResponse, route } from "@/lib/api/handler";
import { listMembers, requireActiveMembership, requireSession } from "@/lib/data/house";

/** GET /api/members — every member, with status, role, residency and room. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const members = await listMembers(session, house.id);
  return jsonResponse({ members });
});
