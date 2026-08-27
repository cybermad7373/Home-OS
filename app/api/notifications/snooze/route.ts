import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { apiErrorFromPostgres } from "@/lib/api/errors";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { z } from "zod";

const snoozeSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/notifications/snooze — the `later` action, from the shade.
 *
 * An hour on, at most twice (section 4). The limit is counted on the row rather
 * than in the service worker, so a member with two devices gets two snoozes and
 * not four. A third attempt is answered with `snoozed_until: null` rather than
 * an error, because the caller is a notification button and there is nowhere
 * for an error to go.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await requireActiveMembership(session);
  const { id } = await parseBody(request, snoozeSchema);

  const { data, error } = await session.supabase.rpc("snooze_notification", {
    p_notification_id: id,
  });

  if (error) throw apiErrorFromPostgres(error);
  return jsonResponse({ snoozed_until: data ?? null });
});
