import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listAbsences, requestAbsence } from "@/lib/data/absence";
import { absenceSchema } from "@/lib/validation/absence";
import { houseToday } from "@/lib/utils/date";

/**
 * GET /api/absences[?member=&from=]
 *
 * Who is away and who has asked to be. Every member sees the Home's, not only
 * their own: an absence is the reason somebody else is doing the washing up,
 * and hiding it would make the redistribution look arbitrary.
 *
 * Defaults to requests that have not finished yet — `to_date` today or later.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const params = new URL(request.url).searchParams;

  return jsonResponse({
    absences: await listAbsences(session, house.id, {
      memberId: params.get("member") ?? undefined,
      from: params.get("from") ?? houseToday(house.timezone),
    }),
  });
});

/**
 * POST /api/absences — ask the Home for time away (AV-05).
 *
 * This is the endpoint that replaces declaring an away day outright. The other
 * two exception kinds — home all day, different hours — still go through
 * `POST /api/availability/exceptions`, because they cost the Home nothing.
 *
 * Nothing about the schedule changes here. It changes when somebody approves,
 * wherever that response lands.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const body = await parseBody(request, absenceSchema);

  const result = await requestAbsence(session, house.id, member.id, body);

  return jsonResponse(
    {
      absence: result.absence,
      decision: result.decision,
      applied: result.applied,
      redistribution: result.redistribution,
    },
    201,
  );
});
