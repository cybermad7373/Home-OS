import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { editRule } from "@/lib/data/rules";
import { updateRuleSchema } from "@/lib/validation/rules";

/**
 * PATCH /api/rules/:id — edit one rule.
 *
 * The same shape as submitting one: a new version is prepared and a
 * `change_rule` decision is raised, and nothing changes until it applies. The
 * version already in force stays in force in the meantime, which is why the
 * screen can show the rule as it is with a chip saying the Home is being asked
 * about it.
 *
 * The body is a whole version rather than a patch, deliberately.
 * `home_rule_versions` stores a snapshot, and RL-07's "from what, to what" has
 * to compare two complete versions — a partial update would make the history
 * answer that question against whichever fields the caller happened to send.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house, member } = await requireLeadMembership(session);
    const { id } = await context.params;
    const body = await parseBody(request, updateRuleSchema);

    const result = await editRule(session, house.id, id, member.id, body);

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
