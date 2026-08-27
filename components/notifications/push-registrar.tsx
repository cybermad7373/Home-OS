"use client";

import { useEffect } from "react";
import { enablePush, pushSupported } from "@/lib/utils/push";

/**
 * Keeps an already-permitted device registered.
 *
 * It never asks for permission — that happens once, on a screen that explains
 * what will be sent first, because requesting permission cold is the fastest
 * route to a permanent denial (UI spec S-07). All this does is re-register a
 * device whose permission is already granted, which matters because a browser
 * may rotate an endpoint at any time and because the dispatcher deletes a
 * subscription the moment a push service says it is gone.
 */
export function PushRegistrar({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  useEffect(() => {
    if (!vapidPublicKey) return;
    if (!pushSupported()) return;
    if (Notification.permission !== "granted") return;

    void enablePush(vapidPublicKey).catch(() => undefined);
  }, [vapidPublicKey]);

  return null;
}
