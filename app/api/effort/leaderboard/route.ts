import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getStanding } from "@/lib/data/chores";
import { concentrationRatio, rankStanding } from "@/lib/domain/fairness/targets";

/**
 * GET /api/effort/leaderboard — who is carrying the house.
 *
 * Everybody sees it. The concentration ratio is the BRD's headline metric: the
 * share of confirmed work done by the top three. If it falls month over month,
 * the product is working.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const since = new URL(request.url).searchParams.get("since") ?? undefined;
  const standing = await getStanding(session, house.id, since);

  const ranked = rankStanding(
    standing.map((row) => ({
      memberId: row.memberId,
      earnedPoints: row.earnedPoints,
      targetPoints: row.targetPoints,
      carry: row.carry,
      choresDone: row.choresDone,
      choresMissed: row.choresMissed,
    })),
  );

  const nameById = new Map(standing.map((row) => [row.memberId, row.displayName]));

  return jsonResponse({
    standing: ranked.map((row) => ({
      ...row,
      display_name: nameById.get(row.memberId) ?? "Someone",
    })),
    concentration_ratio: concentrationRatio(ranked),
  });
});
