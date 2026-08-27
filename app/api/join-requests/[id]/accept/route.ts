import { jsonResponse, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { acceptJoinRequest } from "@/lib/data/homes";

/**
 * POST /api/join-requests/:id/accept — lead only.
 *
 * The created membership is Active with role `member`. This is the one insert
 * into `house_members` a client can reach, and it needs a request the person
 * raised themselves from a link they held.
 */
export const POST = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireLeadMembership(session);
    const { id } = await context.params;
    const member = await acceptJoinRequest(session, id);
    return jsonResponse({ id: member.id, status: member.status, role: member.role }, 201);
  },
);
