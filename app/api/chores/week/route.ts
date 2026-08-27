import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listAssignments, weekStartOf } from "@/lib/data/chores";
import { houseToday } from "@/lib/utils/date";

/** GET /api/chores/week?week_start=2026-08-24 — the house week view. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const requested = new URL(request.url).searchParams.get("week_start");
  const weekStart = requested ?? weekStartOf(houseToday(house.timezone));

  const end = new Date(`${weekStart}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);

  const assignments = await listAssignments(session, house.id, {
    from: weekStart,
    to: end.toISOString().slice(0, 10),
  });

  return jsonResponse({ week_start: weekStart, assignments });
});
