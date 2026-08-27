import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getPrefs, setPrefs } from "@/lib/data/notifications";
import { notificationPrefsSchema } from "@/lib/validation/notifications";

/** GET /api/notifications/prefs — the caller's switches and quiet hours. */
export const GET = route(async () => {
  const session = await requireSession();
  await requireActiveMembership(session);
  return jsonResponse({ prefs: await getPrefs(session) });
});

/**
 * PATCH /api/notifications/prefs — change some of them.
 *
 * Settlement is not in the schema and is forced true by the database function
 * underneath, so a hand-written request that tries to disable it changes
 * nothing. NT-05 gives members control of their notifications; BR and the spec
 * make one family the exception, and the exception is enforced twice.
 */
export const PATCH = route(async (request: Request) => {
  const session = await requireSession();
  await requireActiveMembership(session);
  const input = await parseBody(request, notificationPrefsSchema);

  return jsonResponse({ prefs: await setPrefs(session, input) });
});
