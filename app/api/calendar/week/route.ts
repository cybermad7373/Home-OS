import { jsonResponse, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getCalendarWeek } from "@/lib/data/calendar";
import { weekStartOfDate } from "@/lib/domain/home/calendar";
import { calendarDateSchema } from "@/lib/validation/calendar";
import { houseToday } from "@/lib/utils/date";

/**
 * GET /api/calendar/week?week_start=2026-08-24 — points per member, the week's
 * money, meals logged and approvals pending.
 *
 * Any date inside the week is accepted and snapped back to its Monday, so a
 * caller paging by day never has to know where the week starts.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const raw =
    new URL(request.url).searchParams.get("week_start") ??
    houseToday(context.house.timezone);

  const parsed = calendarDateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_FAILED", { week_start: parsed.error.issues[0]?.message });
  }

  return jsonResponse(await getCalendarWeek(session, context, weekStartOfDate(parsed.data)));
});
