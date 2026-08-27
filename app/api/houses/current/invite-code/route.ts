import { jsonResponse, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { regenerateInviteCode } from "@/lib/data/mutations";

/** POST /api/houses/current/invite-code — BR-009, the old code dies immediately. */
export const POST = route(async () => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const code = await regenerateInviteCode(session, house.id);
  return jsonResponse({ invite_code: code });
});
