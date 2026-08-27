import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listExceptions, saveException } from "@/lib/data/availability";
import { redistributePublishedDay } from "@/lib/data/chores";
import { availabilityExceptionSchema } from "@/lib/validation/availability";
import { houseToday } from "@/lib/utils/date";

/**
 * GET /api/availability/exceptions?from=&to=[&member=]
 *
 * The house's declared exceptions over a range. Defaults to the next 28 days,
 * which is what the calendar strip shows.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const params = new URL(request.url).searchParams;
  const today = houseToday(house.timezone);
  const from = params.get("from") ?? today;
  const to = params.get("to") ?? addDays(today, 28);
  const memberId = params.get("member") ?? undefined;

  return jsonResponse({
    exceptions: await listExceptions(session, house.id, { from, to }, memberId),
  });
});

/**
 * POST /api/availability/exceptions — declare a day.
 *
 * Only for the caller, and only forward. A member declaring yesterday away
 * after missing yesterday's chore is not recording an absence, they are editing
 * the record, and the record is the entire product.
 *
 * If the day already has a published schedule, that day's assignments for this
 * member are redistributed on the spot — an away declaration that leaves the
 * chores sitting on the absent person is worse than no declaration at all.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const input = await parseBody(request, availabilityExceptionSchema);

  if (input.exc_date < houseToday(house.timezone)) {
    throw new ApiError("EXCEPTION_PAST");
  }

  const exception = await saveException(session, house.id, member.id, input);

  const redistribution = await redistributePublishedDay(
    session,
    house.id,
    member.id,
    input.exc_date,
  );

  return jsonResponse({ exception, redistribution }, 201);
});

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
