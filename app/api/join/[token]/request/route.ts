import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireSession } from "@/lib/data/house";
import { requestJoin } from "@/lib/data/homes";
import { inviteTokenSchema } from "@/lib/validation/common";
import { joinRequestSchema } from "@/lib/validation/house";

/**
 * POST /api/join/:token/request — the caller asks to join.
 *
 * This is the only path to membership (HM-06). There is no endpoint that
 * creates a member for somebody else, and adding one would be a defect.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ token: string }> }) => {
    const session = await requireSession();
    const { token } = await context.params;
    const { message } = await parseBody(request, joinRequestSchema);
    const parsed = inviteTokenSchema.parse(token);
    const result = await requestJoin(session, parsed, message);
    return jsonResponse(
      { status: result.status, house_name: result.houseName, house_id: result.houseId },
      202,
    );
  },
);
