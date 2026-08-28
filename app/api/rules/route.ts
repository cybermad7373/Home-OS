import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import {
  requireActiveMembership,
  requireLeadMembership,
  requireSession,
} from "@/lib/data/house";
import { createRule, listRules } from "@/lib/data/rules";
import { createRuleSchema } from "@/lib/validation/rules";

/**
 * GET /api/rules — every rule in the Home with its current version.
 *
 * Every member, not only leads. A Home's rules are the thing its members are
 * bound by; a list only an Admin can read is a set of instructions rather than
 * an agreement (RL-05, and section 6.5's screen).
 */
export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  return jsonResponse({ rules: await listRules(session, house.id) });
});

/**
 * POST /api/rules — submit a rule.
 *
 * It creates a `change_rule` decision and returns it; the rule itself stays
 * `draft` until that decision applies (RL-03, RL-04). Nothing on this path can
 * make a rule live, including in a Home whose only member is the caller — there
 * the decision auto-approves and the effect runs, which is a decision taking
 * effect rather than a route handler writing an active rule.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireLeadMembership(session);
  const body = await parseBody(request, createRuleSchema);

  const result = await createRule(session, house.id, member.id, body);

  return jsonResponse(
    {
      rule_id: result.ruleId,
      version_id: result.versionId,
      version_no: result.versionNo,
      status: result.status,
      decision: result.decision,
      applied: result.applied,
    },
    201,
  );
});
