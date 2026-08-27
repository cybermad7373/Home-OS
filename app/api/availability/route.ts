import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import {
  deriveWindows,
  getAvailability,
  saveAvailability,
} from "@/lib/data/availability";
import { availabilityWeekSchema } from "@/lib/validation/availability";

/**
 * GET /api/availability — the caller's seven-day pattern, and what it derives.
 *
 * `?member=<id>` reads somebody else's. Everybody can: the pattern is the
 * evidence behind every assignment, and a schedule whose inputs nobody can
 * check is only an assertion.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);

  const requested = new URL(request.url).searchParams.get("member");
  const memberId = requested ?? member.id;

  const days = await getAvailability(session, house.id, memberId);

  return jsonResponse({
    member_id: memberId,
    days,
    derived: deriveWindows(days),
  });
});

/**
 * PUT /api/availability — replace the caller's whole week.
 *
 * Only ever the caller's own. An admin editing somebody's availability would be
 * an admin deciding when somebody else is at home, and the schedule that came
 * out of it would be theirs to argue with rather than the member's to own.
 */
export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const input = await parseBody(request, availabilityWeekSchema);

  const days = await saveAvailability(session, house.id, member.id, input.days);

  return jsonResponse({ member_id: member.id, days, derived: deriveWindows(days) });
});
