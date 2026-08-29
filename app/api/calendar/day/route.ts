import { jsonResponse, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getCalendarDay } from "@/lib/data/calendar";
import { calendarDateSchema } from "@/lib/validation/calendar";
import { houseToday } from "@/lib/utils/date";

/**
 * GET /api/calendar/day?date=2026-08-26 — S-52's day view, in one request.
 *
 * Presence, chores with their assignees, money logged, meals eaten, planned
 * meals (FD-20) and the decisions still waiting — the whole day, composed on
 * the server. `date` defaults to today in the Home's own timezone, never the
 * server's.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const raw = new URL(request.url).searchParams.get("date");
  const date = raw ?? houseToday(context.house.timezone);

  const parsed = calendarDateSchema.safeParse(date);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_FAILED", { date: parsed.error.issues[0]?.message });
  }

  return jsonResponse(await getCalendarDay(session, context, parsed.data));
});
