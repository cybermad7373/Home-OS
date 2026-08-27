import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getUnreadCount, markAllRead, markRead } from "@/lib/data/notifications";
import { markReadSchema } from "@/lib/validation/notifications";

/**
 * POST /api/notifications/read — mark one row read, or the whole feed.
 *
 * Read state syncs across devices because it lives on the row rather than in
 * the browser (section 8). Marking something read on a phone marks it read on
 * the laptop, which is the only behaviour that makes the badge count worth
 * looking at.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const { id } = await parseBody(request, markReadSchema);

  if (id) {
    await markRead(session, id);
  } else {
    await markAllRead(session, house.id);
  }

  return jsonResponse({ unread: await getUnreadCount(session) });
});
