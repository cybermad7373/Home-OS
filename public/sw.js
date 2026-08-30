/*
 * HouseOS service worker.
 *
 * Phase 1 scope: precache the app shell so the installed app opens instantly
 * and shows something useful with no network. Cached reads of the week's
 * schedule and the month's expenses arrive with the modules that own them, and
 * the offline write queue lands with the first mutation worth queueing.
 *
 * Phase 7 adds push. The interesting part is at the bottom: the `done` action
 * marks a chore done from the notification shade without opening the app, which
 * docs/11-NOTIFICATIONS-SPEC.md section 4 calls the single highest-value
 * interaction in the product — it removes every step between remembering and
 * recording.
 */

const VERSION = "houseos-v3";
const SHELL = ["/offline", "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Only content-addressed assets may be served from the cache without asking the
 * network. Everything else is house data in some form.
 *
 * `/_next/static` filenames carry a build hash, and the icons and manifest
 * change with a deploy rather than with the household — so a cached copy of one
 * of those is the same bytes the network would return.
 */
function isImmutableAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never cache anything that mutates, and never cache an API read: house data
  // that is quietly stale is worse than an honest failure.
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  /*
   * A React Server Component payload is house data, and it does not arrive as a
   * navigation — `router.refresh()` fetches it with mode "cors". A cache-first
   * rule that catches everything non-navigational therefore answers every
   * refresh in the app from the first copy it ever saw: a lead lets somebody in,
   * the queue empties, and the new member never appears until the page is
   * reloaded by hand. The screen looks like the write half-failed.
   *
   * So RSC requests go to the network like any other read of the household.
   */
  const isRsc = url.searchParams.has("_rsc") || request.headers.get("RSC") === "1";

  if (request.mode === "navigate" || isRsc) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        // An RSC refetch has no useful offline fallback: handing the router the
        // offline page would replace the screen with it. Failing is honest, and
        // the app keeps showing what the person was already looking at.
        if (cached) return cached;
        return isRsc ? Response.error() : caches.match("/offline");
      }),
    );
    return;
  }

  if (!isImmutableAsset(url.pathname)) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// ---------------------------------------------------------------------------
// Push — docs/11-NOTIFICATIONS-SPEC.md section 4
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  // A push with no payload still means something happened. Showing a generic
  // card is better than showing nothing: the browser will display its own
  // "site updated in the background" notice otherwise, which is worse copy than
  // anything we could write.
  let payload = {
    title: "HouseOS",
    body: "Something needs you.",
    data: { url: "/notifications" },
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: payload.badge ?? "/icons/badge-72.png",
      // The tag is what collapses a repeat: a second reminder for the same
      // chore replaces the first rather than stacking beneath it.
      tag: payload.tag,
      data: payload.data ?? { url: "/notifications" },
      actions: (payload.actions ?? []).slice(0, 2),
      requireInteraction: payload.requireInteraction === true,
    }),
  );
});

/** Fires and forgets, then tells the member what happened in the same tag. */
async function actOnNotification(notification, action) {
  const data = notification.data ?? {};
  const assignmentId = data.assignment_id;

  try {
    if (action === "done" && assignmentId) {
      await fetch(`/api/chores/${assignmentId}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await self.registration.showNotification("Marked done", {
        body: "Waiting for someone to confirm.",
        icon: "/icons/icon-192.png",
        tag: notification.tag,
      });
      return;
    }

    if (action === "confirm" && assignmentId) {
      await fetch(`/api/chores/${assignmentId}/confirm`, { method: "POST" });
      await self.registration.showNotification("Confirmed", {
        body: "Their points are posted.",
        icon: "/icons/icon-192.png",
        tag: notification.tag,
      });
      return;
    }

    if (action === "later" && data.notificationId) {
      const response = await fetch("/api/notifications/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.notificationId }),
      });
      const result = await response.json().catch(() => ({}));
      await self.registration.showNotification(
        result.snoozed_until ? "Snoozed an hour" : "That's the last snooze",
        {
          body: result.snoozed_until
            ? "It will come back."
            : "Two is the limit. This one is still yours.",
          icon: "/icons/icon-192.png",
          tag: notification.tag,
        },
      );
    }
  } catch {
    // The action failed — usually because the device is offline. Open the app
    // at the thing instead, so the member can finish the job by hand rather
    // than believe a tap that did nothing.
    await self.clients.openWindow(data.url ?? "/notifications");
  }
}

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data ?? {};
  notification.close();

  if (event.action) {
    event.waitUntil(actOnNotification(notification, event.action));
    return;
  }

  // A plain tap goes to the thing itself. An already-open tab is focused rather
  // than duplicated, so tapping four notifications does not leave four windows.
  event.waitUntil(
    (async () => {
      const url = data.url ?? "/notifications";
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => undefined);
          return;
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});

// A subscription can be rotated by the browser without anybody asking. When it
// is, the old endpoint is already dead, so the new one is registered
// immediately rather than at the next app open.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const subscription = event.newSubscription;
      if (!subscription) return;

      await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      }).catch(() => undefined);
    })(),
  );
});
