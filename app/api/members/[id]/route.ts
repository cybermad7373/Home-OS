import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { removeMember, setOwnCookingFlag, updateMember } from "@/lib/data/mutations";
import { updateMemberSchema } from "@/lib/validation/house";

/**
 * PATCH /api/members/:id — role, residency, the cooking flag.
 *
 * Admin for role, lead for the rest (docs/05-API-SPEC.md section 2.2), with one
 * exception: a member may set their own cooking flag during onboarding (S-06).
 *
 * **Changed in 2.0:** no `status`. A Requested person becomes Active by having
 * their request accepted, and removal has its own verb below.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;
    const input = await parseBody(request, updateMemberSchema);

    const isSelf = id === member.id;
    const isLead = member.role === "admin" || member.role === "co_admin";
    const onlyCookingFlag = input.role === undefined && input.residency === undefined;

    if (!isLead) {
      if (!isSelf || !onlyCookingFlag || input.can_cook === undefined) {
        throw new ApiError(isSelf ? "LEAD_REQUIRED" : "NOT_YOUR_RECORD");
      }
      const updated = await setOwnCookingFlag(session, member.id, input.can_cook);
      return jsonResponse(updated);
    }

    // Promoting or demoting is the one thing a Co-Admin may not do. The
    // database says so too — the privileged-column trigger asks for Admin —
    // and this check exists for the better message.
    if (input.role !== undefined && member.role !== "admin") {
      throw new ApiError("ADMIN_REQUIRED");
    }

    const updated = await updateMember(session, house.id, id, input);
    return jsonResponse(updated);
  },
);

/**
 * DELETE /api/members/:id — remove a member from the Home. Admin only.
 *
 * Removal has two states (D-45). A member who still owes the Home money, or is
 * owed by it, becomes Inactive **and** flagged `pending_settlement`: they stay
 * in the settlement, and the daily job completes the removal on the day the
 * last payment is confirmed. The database decides which state applies, so this
 * handler cannot get it wrong by forgetting to look.
 *
 * Phase 11 puts this behind a `remove_member` decision and this route becomes
 * a proposer returning `409 DECISION_REQUIRED` (R-3).
 */
export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { member } = await requireActiveMembership(session);
    const { id } = await context.params;

    if (member.role !== "admin") throw new ApiError("ADMIN_REQUIRED");
    if (id === member.id) throw new ApiError("NOT_YOUR_RECORD");

    const removed = await removeMember(session, id);
    return jsonResponse({
      id: removed.id,
      status: removed.status,
      left_date: removed.left_date,
      pending_settlement: removed.pending_settlement,
    });
  },
);
