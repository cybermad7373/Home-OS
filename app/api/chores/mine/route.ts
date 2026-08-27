import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listAssignments, weekStartOf } from "@/lib/data/chores";
import { houseToday } from "@/lib/utils/date";

/** GET /api/chores/mine?from=&to= — the caller's own chores. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);

  const params = new URL(request.url).searchParams;
  const today = houseToday(house.timezone);
  const from = params.get("from") ?? weekStartOf(today);
  const to = params.get("to") ?? addDays(from, 6);

  const assignments = await listAssignments(session, house.id, { from, to }, member.id);
  return jsonResponse({ assignments });
});

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
