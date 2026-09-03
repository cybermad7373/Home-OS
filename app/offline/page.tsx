import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

/**
 * The shell the service worker falls back to when a navigation cannot reach the
 * network. It is deliberately static: it must render with no session, no house
 * and no data.
 */
export default function OfflinePage() {
  return (
    <main className="dot-grid flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="eyebrow-text mb-2">No connection</p>
      <p className="title-text">You are offline</p>
      <p className="caption-text max-w-[40ch] text-text-muted">
        HouseOS opens without a connection, but it cannot load fresh house data. It will
        catch up as soon as you are back.
      </p>
    </main>
  );
}
