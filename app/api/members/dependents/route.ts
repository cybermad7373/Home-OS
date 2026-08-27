import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { addDependent } from "@/lib/data/mutations";
import { dependentSchema } from "@/lib/validation/house";

/**
 * POST /api/members/dependents — add a resident who has no account.
 *
 * A child, an elderly parent, anybody who lives here, counts as a head at the
 * dinner table, and is never going to log in. They appear in the member list
 * and in the split arithmetic; their share lands on their guardian.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, dependentSchema);

  const member = await addDependent(session, house.id, {
    name: input.name,
    guardianMemberId: input.guardian_member_id,
    sharesCost: input.shares_cost,
    doesChores: input.does_chores,
    residency: input.residency,
  });

  return jsonResponse(member, 201);
});
