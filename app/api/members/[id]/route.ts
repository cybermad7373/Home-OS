import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { setOwnCookingFlag, updateMember } from "@/lib/data/mutations";
import { proposeDecision } from "@/lib/data/governance";
import { proposeRemovalSchema } from "@/lib/validation/governance";
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
 * DELETE /api/members/:id — **a proposer since phase 11** (R-3, BR-165).
 *
 * It no longer removes anybody. It raises a `remove_member` decision and
 * answers `409 DECISION_REQUIRED` carrying it, so a client written against the
 * old behaviour learns what happened instead of meeting a 404 and concluding
 * the person is already gone. The current client opens S-37 and posts to
 * `/api/decisions`; this route exists for the one that has not been updated.
 *
 * Removal still has two states (D-45) and the database still decides which one
 * applies — that happens at apply time now, inside `apply_decision`, once the
 * Home has answered.
 *
 * A reason is required for a Critical decision, so the body may carry one. An
 * old client sends no body at all; it is told what is needed rather than having
 * a reason invented on its behalf and written into the permanent record.
 */
export const DELETE = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireActiveMembership(session);
    const { id } = await context.params;

    if (id === member.id) throw new ApiError("NOT_YOUR_RECORD");

    const body = await parseBody(request, proposeRemovalSchema);

    if (!body.reason) {
      throw new ApiError("DECISION_REQUIRED", {
        propose: {
          endpoint: "/api/decisions",
          type: "remove_member",
          subject_member_id: id,
          reason_required: true,
        },
      });
    }

    const result = await proposeDecision(session, house.id, member.id, {
      type: "remove_member",
      subject_member_id: id,
      reason: body.reason,
    });

    // A one-person Home has nobody to ask, so the decision auto-approved and
    // the effect has already run. The removal the caller asked for did happen,
    // and answering 409 there would be a lie about a member who is gone.
    if (result.applied) {
      const applied = (result.decision.result ?? {}) as Record<string, unknown>;
      return jsonResponse({
        id: applied.member_id ?? id,
        status: applied.status ?? "inactive",
        left_date: applied.left_date ?? null,
        pending_settlement: applied.pending_settlement ?? false,
        decision_id: result.decision.id,
      });
    }

    throw new ApiError("DECISION_REQUIRED", {
      decision_id: result.decision.id,
      status: result.decision.status,
      applied: false,
      apply_refusal: result.applyRefusal,
    });
  },
);
