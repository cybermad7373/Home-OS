import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { createRestriction, listMyRestrictions } from "@/lib/data/food";
import { createRestrictionSchema } from "@/lib/validation/food";

/**
 * GET /api/food/restrictions — the caller's own, and any dependent's they
 * guard. Health information about one person (section 5.2a, BR-226): RLS
 * (`owns_member_record`) is the actual boundary, this only asks for "mine".
 */
export const GET = route(async () => {
  const session = await requireSession();
  const { member } = await requireActiveMembership(session);

  return jsonResponse({ restrictions: await listMyRestrictions(session, member.id) });
});

/**
 * POST /api/food/restrictions — allergy, intolerance or diet (section 5.2a).
 *
 * `memberId` names the caller or a dependent they guard. RLS
 * (`owns_member_record`) is the actual enforcement; anything else is refused
 * at the database regardless of what this route lets through.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { member } = await requireActiveMembership(session);
  const body = await parseBody(request, createRestrictionSchema);

  const restrictionId = await createRestriction(session, member.house_id, body);

  return jsonResponse({ restrictionId }, 201);
});
