import { jsonResponse, route } from "@/lib/api/handler";
import { getMemberPositionReport } from "@/lib/data/analytics";
import { requireActiveMembership, requireSession } from "@/lib/data/house";

/** GET /api/analytics/members?period=2026-08 — approved paid-versus-fair-share positions. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const period = new URL(request.url).searchParams.get("period") ?? undefined;
  const report = await getMemberPositionReport(session, house, { period });
  return jsonResponse(report);
});
