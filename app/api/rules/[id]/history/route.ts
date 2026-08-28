import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { ruleHistory } from "@/lib/data/rules";

/**
 * GET /api/rules/:id/history — every version of one rule.
 *
 * RL-07 in full: who changed it, when, from what, to what, why, and who
 * acknowledged it. Every member may read it, for the same reason every member
 * may read the list — a rule's history is the evidence that the rule is an
 * agreement, and evidence only one person can see is not evidence.
 *
 * The original text of every version comes back verbatim (RL-09), because that
 * is what the Home actually agreed to; the structured fields are one reading of
 * it that somebody checked.
 */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { house } = await requireActiveMembership(session);
    const { id } = await context.params;

    const { rule, entries } = await ruleHistory(session, house.id, id);

    return jsonResponse({ rule, versions: entries });
  },
);
