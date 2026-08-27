import { jsonResponse, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { getLiveInvitation, inviteUrl, rotateInvitation } from "@/lib/data/homes";

/** GET /api/invitations — the Home's live link. Lead only. */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireLeadMembership(session);
  const invitation = await getLiveInvitation(session, house.id);
  if (!invitation) return jsonResponse({ invitation: null });
  return jsonResponse({
    invitation: {
      id: invitation.id,
      invite_url: inviteUrl(invitation.token),
      expires_at: invitation.expires_at,
      created_at: invitation.created_at,
    },
  });
});

/**
 * POST /api/invitations — rotate the link.
 *
 * SEC-15: the previous link dies immediately, and no existing membership or
 * open request is affected.
 */
export const POST = route(async () => {
  const session = await requireSession();
  const { house } = await requireLeadMembership(session);
  const invitation = await rotateInvitation(session, house.id);
  return jsonResponse(
    {
      id: invitation.id,
      invite_url: inviteUrl(invitation.token),
      expires_at: invitation.expires_at,
    },
    201,
  );
});
