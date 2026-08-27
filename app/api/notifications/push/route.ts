import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { deletePushSubscription, listDevices, savePushSubscription } from "@/lib/data/notifications";
import { pushSubscriptionSchema, pushUnsubscribeSchema } from "@/lib/validation/notifications";

/**
 * GET /api/notifications/push — the VAPID public key and this member's devices.
 *
 * The browser needs it to create a subscription, and it is public by
 * definition: it is what the push service uses to check our signature. The
 * private half never leaves the Edge Function.
 *
 * A missing key is answered honestly rather than with a broken subscription
 * attempt, so the settings screen can say "push isn't configured" instead of
 * failing silently.
 */
export const GET = route(async () => {
  const session = await requireSession();
  await requireActiveMembership(session);

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  return jsonResponse({
    vapid_public_key: key,
    configured: key !== null,
    devices: await listDevices(session),
  });
});

/**
 * POST /api/notifications/push — register this device.
 *
 * One row per endpoint, re-registered on every app open. A browser may rotate
 * an endpoint without telling anybody, which is why the write is an upsert and
 * why the dispatcher deletes on 404 and 410 rather than keeping a tally of
 * failures.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await requireActiveMembership(session);
  const subscription = await parseBody(request, pushSubscriptionSchema);

  await savePushSubscription(
    session,
    subscription,
    request.headers.get("user-agent")?.slice(0, 300) ?? null,
  );

  return jsonResponse({ registered: true }, 201);
});

/**
 * DELETE /api/notifications/push — a device asked to stop.
 *
 * Any of the caller's own endpoints, not only the one making the request: a
 * member removing the laptop they left at their parents' house cannot make the
 * request from it.
 */
export const DELETE = route(async (request: Request) => {
  const session = await requireSession();
  await requireActiveMembership(session);
  const { endpoint } = await parseBody(request, pushUnsubscribeSchema);

  await deletePushSubscription(session, endpoint);
  return jsonResponse({ registered: false });
});
