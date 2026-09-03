"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The steps onboarding no longer forces you through.
 *
 * Signing up used to be six screens before the app: username, home, AI,
 * profile, availability, notifications. Three of those are genuinely required —
 * without a username, a home and a name the app cannot do anything — and three
 * are configuration that a new member has no basis for answering yet. Asking
 * somebody what hours they are usually out, before they have seen a single
 * chore, is asking them to guess.
 *
 * So those three are deferred, and this is what stops them being lost. It sits
 * on Home, names what is still worth doing and why it matters, and each one can
 * be dismissed for good.
 *
 * Dismissal is per browser rather than per account, which is the right trade
 * for a nudge: it costs nothing if it is forgotten on a second device, and it
 * needs no column, no migration and no write path of its own.
 */

export interface Nudge {
  id: string;
  href: string;
  title: string;
  /** Why it is worth a minute. Never "complete your profile". */
  body: string;
}

const STORAGE_KEY = "houseos.nudges.dismissed";

/**
 * `localStorage` read through `useSyncExternalStore` rather than through an
 * effect that sets state.
 *
 * The effect version is a synchronous setState inside an effect — a cascading
 * render, and the thing this hook exists to replace. It also gets hydration
 * right for free: the server snapshot is "nothing dismissed", the client reads
 * the real value, and React reconciles the difference rather than the markup
 * disagreeing with the first paint.
 *
 * Every access is wrapped, because a private window, cleared site data or a
 * browser set to block storage makes the accessor itself throw.
 */
const EMPTY = "[]";
let cache = EMPTY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab dismissing one should dismiss it here too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): string {
  try {
    cache = window.localStorage.getItem(STORAGE_KEY) ?? EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

/** The server has no storage, and nothing has been dismissed there. */
function getServerSnapshot(): string {
  return EMPTY;
}

function write(next: string[]) {
  cache = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, cache);
  } catch {
    // Dismissed for this session at least.
  }
  for (const listener of listeners) listener();
}

export function SetupNudges({ nudges }: { nudges: Nudge[] }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dismissed = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }, [raw]);

  function dismiss(id: string) {
    write([...dismissed, id]);
  }

  const showing = nudges.filter((nudge) => !dismissed.includes(nudge.id));
  if (showing.length === 0) return null;

  return (
    <section aria-label="Finish setting up" className="mb-6">
      <p className="eyebrow-text mb-2">Worth a minute</p>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        {showing.map((nudge) => (
          <li key={nudge.id} className="flex items-center">
            <Link
              href={nudge.href}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{nudge.title}</span>
                <span className="caption-text block text-text-muted">{nudge.body}</span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-text-subtle" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => dismiss(nudge.id)}
              aria-label={`Dismiss: ${nudge.title}`}
              className={cn(
                "touch-target flex shrink-0 items-center justify-center px-3",
                "text-text-subtle transition-colors hover:text-text",
              )}
            >
              <X size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
