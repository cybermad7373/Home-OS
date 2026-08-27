import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getFeed } from "@/lib/data/notifications";
import { feedQuerySchema } from "@/lib/validation/notifications";

/**
 * GET /api/notifications — the in-app feed.
 *
 * Section 8 of docs/11-NOTIFICATIONS-SPEC.md: the feed is the record. Every
 * notification the system produced for the caller is here, whether or not their
 * phone ever showed it, and whether or not the category was muted — muting
 * stops the push, not the record.
 *
 * `?before=<iso>` pages backwards; `?unread=true` filters.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  await requireActiveMembership(session);

  const params = new URL(request.url).searchParams;
  const query = feedQuerySchema.parse({
    before: params.get("before") ?? undefined,
    limit: params.get("limit") ?? undefined,
    unread: params.get("unread") ?? undefined,
  });

  const page = await getFeed(session, {
    limit: query.limit,
    before: query.before,
    unreadOnly: query.unread,
  });

  return jsonResponse(page);
});
