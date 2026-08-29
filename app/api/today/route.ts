import { jsonResponse, route } from "@/lib/api/handler";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getToday } from "@/lib/data/today";

/**
 * GET /api/today — the whole of S-50 in one request.
 *
 * Today composes five modules. Asking each of them separately would make the
 * screen's own acceptance criterion — that it answers "what is happening now"
 * immediately — depend on five round trips finishing, so the composition is
 * done on the server and shipped once. The same function renders the page, so
 * a native client and the web app cannot disagree about the day.
 *
 * The Calendar's day view is the same shape for an arbitrary date; this is the
 * caller-shaped version of it, with "what needs me" that a date alone cannot
 * answer.
 */
export const GET = route(async () => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  return jsonResponse(await getToday(session, context));
});
