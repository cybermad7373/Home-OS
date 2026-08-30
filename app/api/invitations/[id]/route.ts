import { jsonResponse, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { revokeInvitation } from "@/lib/data/homes";

/**
 * DELETE /api/invitations/:id — revoke the link without issuing a new one.
 *
 * A Home with no live link is a legitimate state: nobody new can ask until a
 * lead rotates one. That is the only way to close the door.
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireLeadMembership(session);
    const { id } = await context.params;

    await revokeInvitation(session, house.id, id);
    return jsonResponse({ revoked: true });
  },
);
