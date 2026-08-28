import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { setRuleEnabled } from "@/lib/data/rules";
import { disableRuleSchema } from "@/lib/validation/rules";
import { houseToday } from "@/lib/utils/date";

/**
 * POST /api/rules/:id/enable — put a disabled rule back in force.
 *
 * The mirror of disable, and the same machinery: a copy of the last version
 * with its end date removed, activated by a `change_rule` decision. Not
 * documented as its own endpoint in docs/05-API-SPEC.md section 4, which lists
 * only disable — but a rules screen with a Disable and no way back is a screen
 * that turns every reconsideration into a duplicate rule with the same words,
 * and the version chain is what RL-06 exists to keep unbroken.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireLeadMembership(session);
    const { id } = await context.params;
    const body = await parseBody(request, disableRuleSchema);

    const result = await setRuleEnabled(
      session,
      house.id,
      id,
      member.id,
      true,
      body,
      houseToday(house.timezone),
    );

    return jsonResponse({
      rule_id: result.ruleId,
      version_id: result.versionId,
      version_no: result.versionNo,
      status: result.status,
      decision: result.decision,
      applied: result.applied,
    });
  },
);
