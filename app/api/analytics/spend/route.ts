import { jsonResponse, route } from "@/lib/api/handler";
import { getSpendReport } from "@/lib/data/analytics";
import { requireActiveMembership, requireSession } from "@/lib/data/house";

/** GET /api/analytics/spend?months=6 — approved spend trend and categories. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const raw = Number(new URL(request.url).searchParams.get("months") ?? 6);
  const report = await getSpendReport(session, house, { months: Number.isFinite(raw) ? raw : 6 });
  return jsonResponse(report);
});
