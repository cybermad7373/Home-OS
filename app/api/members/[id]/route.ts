import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { setOwnCookingFlag, updateMember } from "@/lib/data/mutations";
import { updateMemberSchema } from "@/lib/validation/house";

/**
 * PATCH /api/members/:id — approve a pending member, change role or residency,
 * set the cooking flag, deactivate.
 *
 * Admin for everything except one case: a member may set their own cooking flag
 * during onboarding (screen S-06).
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, updateMemberSchema);

    const isSelf = id === member.id;
    const onlyCookingFlag =
      input.role === undefined && input.status === undefined && input.residency === undefined;

    if (member.role !== "admin") {
      if (!isSelf || !onlyCookingFlag || input.can_cook === undefined) {
        throw new ApiError(isSelf ? "ADMIN_REQUIRED" : "NOT_YOUR_RECORD");
      }
      const updated = await setOwnCookingFlag(session, member.id, input.can_cook);
      return jsonResponse(updated);
    }

    const updated = await updateMember(session, house.id, id, input);
    return jsonResponse(updated);
  },
);
