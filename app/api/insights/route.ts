import { jsonResponse, route } from "@/lib/api/handler";
import { getInsights } from "@/lib/data/insights";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { insightsQuerySchema, searchParamsToObject } from "@/lib/validation/insights";
import type { Granularity } from "@/lib/domain/insights";

/**
 * GET /api/insights — the one endpoint behind the one insights screen.
 *
 * `?type=money|chores|food|home`, with `period`, `granularity`, `months`,
 * `category` and `member` filters. Phase 15's acceptance criterion is that one
 * screen with filters replaces the four-tab analytics page and there is no
 * page-per-report anywhere; an endpoint-per-report would put the same sprawl
 * one layer down.
 *
 * The page renders from the same `getInsights` call, so the screen and the
 * endpoint cannot disagree about a month.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const query = insightsQuerySchema.parse(
    searchParamsToObject(new URL(request.url).searchParams),
  );

  return jsonResponse(
    await getInsights(session, context, {
      type: query.type,
      period: query.period,
      granularity: query.granularity as Granularity,
      months: query.months,
      categoryId: query.category,
      memberId: query.member,
    }),
  );
});
