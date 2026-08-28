import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { setRuleEnabled } from "@/lib/data/rules";
import { disableRuleSchema } from "@/lib/validation/rules";
import { houseToday } from "@/lib/utils/date";

/**
 * POST /api/rules/:id/disable — stop a rule, through the Home.
 *
 * Also a decision, and also a version transition rather than a delete. A rule
 * that was in force in June must still be readable in December with its June
 * values (RL-06), so the new version is a copy of the one in force with an end
 * date on it. The Home is told what it is being asked to stop, and the record
 * keeps both the rule and the fact that it was stopped.
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
      false,
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
