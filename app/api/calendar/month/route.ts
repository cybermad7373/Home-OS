import { jsonResponse, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getCalendarMonth } from "@/lib/data/calendar";
import { calendarPeriodSchema } from "@/lib/validation/calendar";
import { houseToday } from "@/lib/utils/date";

/**
 * GET /api/calendar/month?period=2026-08 — money, points, completion rate,
 * meals, and outside-food against home-cooking spend.
 *
 * `period` defaults to the current month in the Home's timezone. A Home in
 * Chennai looking at the first of the month must not be shown last month
 * because the server is in UTC.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const raw =
    new URL(request.url).searchParams.get("period") ??
    houseToday(context.house.timezone).slice(0, 7);

  const parsed = calendarPeriodSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_FAILED", { period: parsed.error.issues[0]?.message });
  }

  return jsonResponse(await getCalendarMonth(session, context, parsed.data));
});
