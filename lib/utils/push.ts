/**
 * Browser-side push registration.
 *
 * Everything here runs in the page, not on the server, and every function
 * answers rather than throws: a browser that does not support push, a user who
 * has denied permission and a service worker that has not activated yet are all
 * ordinary states of the world, not errors.
 */

export type PushState =
  | "unsupported"
  | "unconfigured"
  | "default"
  | "granted"
  | "denied"
  | "subscribed";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The VAPID key travels as base64url and `subscribe` wants bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Subscribes this device and registers it with the server.
 *
 * Re-subscribing an already-subscribed device is not wasted work: the endpoint
 * is upserted, which is how a device that was deleted after a 410 finds its way
 * back into the table on the next app open.
 */
export async function enablePush(vapidPublicKey: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!vapidPublicKey) return "unconfigured";

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== "granted") return permission === "denied" ? "denied" : "default";

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    }));

  const response = await fetch("/api/notifications/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  return response.ok ? "subscribed" : "granted";
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => undefined);
  await fetch("/api/notifications/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}
