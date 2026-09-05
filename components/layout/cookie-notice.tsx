"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * What this app stores in your browser, said once.
 *
 * It is a notice rather than a consent banner, and that is a decision rather
 * than a shortcut. HouseOS sets two cookies: the Supabase session, and which
 * Home you picked. Both are strictly necessary — one signs you in, the other is
 * the entire answer to which household's data you are looking at — and neither
 * profiles anybody or reaches a third party. Strictly necessary cookies do not
 * require consent under the ePrivacy Directive, and a banner that asks for
 * permission it does not need, for cookies it will set anyway, teaches people
 * that the button is a formality. That habit is the actual harm.
 *
 * So it says what is stored, links to the page that says it in full, and goes
 * away. If this deployment ever adds a cookie that is *not* strictly necessary,
 * this component is the wrong tool and a real consent gate is the right one.
 *
 * It sits *in* the page rather than floating over it. The fixed version — the
 * shape every cookie banner takes — pinned itself to the bottom of the window
 * and covered the Privacy, Terms and Support links in the footer, which are
 * both the links it points at and the only other thing on that row. A notice
 * about transparency that obscures the transparency page is worse than none.
 *
 * Dismissal is `localStorage`, per browser, wrapped in try/catch: a private
 * window, cleared site data or a browser set to block storage makes the
 * accessor itself throw, and a notice that crashes the sign-in screen is worse
 * than one shown twice.
 */

const KEY = "houseos.cookie-notice.seen";

let cache: string | null = null;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Treat "cannot read" as "already seen". Somebody who has blocked storage
    // cannot dismiss this permanently, so showing it on every page load would
    // be the one thing worse than not showing it at all.
    return "blocked";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function snapshot(): string | null {
  const value = read();
  if (value !== cache) cache = value;
  return cache;
}

export function CookieNotice() {
  const seen = useSyncExternalStore(
    subscribe,
    snapshot,
    // The server has no browser storage to read. "Seen" is the safer server
    // snapshot: the notice appears after hydration rather than flashing into
    // the markup and out of it again for somebody who dismissed it weeks ago.
    () => "server",
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      // Nothing to do. The notice closes for this page either way.
    }
    cache = "dismissed";
    for (const listener of listeners) listener();
  }, []);

  if (seen) return null;

  return (
    <div
      role="region"
      aria-label="About cookies"
      className="mt-6 rounded-[var(--radius-md)] border border-border bg-surface-2"
    >
      <div className="flex w-full items-start gap-3 px-3 py-3">
        <p className="caption-text flex-1 text-text-muted">
          HouseOS keeps two cookies: the one that signs you in, and the one that
          remembers which home you are in. There is no tracking and nothing goes
          to anybody else.{" "}
          <Link href="/legal/privacy" className="underline hover:text-text">
            What is stored
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="touch-target -mt-1 shrink-0 rounded-full p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
