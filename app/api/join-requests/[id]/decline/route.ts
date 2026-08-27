import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { declineJoinRequest } from "@/lib/data/homes";
import { declineRequestSchema } from "@/lib/validation/house";

/**
 * POST /api/join-requests/:id/decline — lead only, and a reason is required.
 *
 * The person may ask again: the unique index covers open requests only, so a
 * declined row does not block a second attempt. "They asked three times" stays
 * on the record.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    await requireLeadMembership(session);
    const { id } = await context.params;
    const { reason } = await parseBody(request, declineRequestSchema);
    const declined = await declineJoinRequest(session, id, reason);
    return jsonResponse({ id: declined.id, status: declined.status });
  },
);
