import { jsonResponse, route } from "@/lib/api/handler";
import { getFinancialPosition } from "@/lib/data/insights";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { insightPeriodSchema } from "@/lib/validation/insights";

/**
 * GET /api/insights/position?period=2026-08 — the household financial position
 * (IN-09).
 *
 * Expected against actual, fair share against paid, the Home's surplus or
 * shortfall, and the reserve balance with its movements. Every figure derives
 * from the settlement arithmetic rather than reimplementing it, so this answer
 * and the settle screen's answer are the same numbers.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const raw = new URL(request.url).searchParams.get("period");
  const period = raw ? insightPeriodSchema.parse(raw) : undefined;

  return jsonResponse(await getFinancialPosition(session, context, period));
});
