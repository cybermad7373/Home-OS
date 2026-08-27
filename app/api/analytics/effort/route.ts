import { jsonResponse, route } from "@/lib/api/handler";
import { getEffortConcentrationReport } from "@/lib/data/analytics";
import { requireActiveMembership, requireSession } from "@/lib/data/house";

/** GET /api/analytics/effort?months=6 — effort concentration history. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const raw = Number(new URL(request.url).searchParams.get("months") ?? 6);
  const report = await getEffortConcentrationReport(session, house, {
    months: Number.isFinite(raw) ? raw : 6,
  });
  return jsonResponse(report);
});
