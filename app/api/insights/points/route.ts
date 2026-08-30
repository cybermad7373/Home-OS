import { jsonResponse, route } from "@/lib/api/handler";
import { getPointBreakdown } from "@/lib/data/insights";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { pointBreakdownQuerySchema, searchParamsToObject } from "@/lib/validation/insights";

/**
 * GET /api/insights/points?member=&from=&to=&points= — point explainability
 * (EF-12).
 *
 * "Every points figure openable to the dated records that produced it, and a
 * zero explained as readily as a total."
 *
 * The caller passes the figure it displayed as `points`. The answer says
 * whether the records reconcile with it, so a screen holding a stale total
 * reports a disagreement rather than listing rows that quietly add up to
 * something else.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const query = pointBreakdownQuerySchema.parse(
    searchParamsToObject(new URL(request.url).searchParams),
  );

  return jsonResponse(
    await getPointBreakdown(session, context, {
      memberId: query.member,
      from: query.from,
      to: query.to,
      claimedPoints: query.points,
    }),
  );
});
