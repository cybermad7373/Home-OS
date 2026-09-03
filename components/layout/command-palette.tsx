"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { searchable, visibleGroups, type Destination, type HomeShape } from "./destinations";

/**
 * ⌘K.
 *
 * The honest answer to an app with fifty-six routes: however well the menu is
 * organised, somebody who knows they want "away days" should be able to type it
 * rather than work out which of five groups it was filed under. It also makes
 * the deep screens reachable without promoting them into the menu, which is
 * what lets the menu stay short.
 *
 * It searches the same `destinations.ts` the bar, the sidebar and More render
 * from, so it can never offer a screen the menu does not have or miss one it
 * does.
 *
 * It is mounted only while it is open, and that is deliberate rather than
 * incidental: the query and the cursor should start empty every time, and
 * resetting them from an effect that watches an `open` prop is a synchronous
 * setState inside an effect — a cascading render, and one the linter is right
 * to refuse. Mounting fresh gets the same reset for nothing.
 */
export function CommandPalette({
  onClose,
  shape,
  counts,
}: {
  onClose: () => void;
  shape: HomeShape;
  counts: { approvals: number; notifications: number };
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const all = useMemo(() => searchable(shape), [shape]);
  const groupOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of visibleGroups(shape)) {
      for (const item of group.items) map.set(item.href, group.heading);
    }
    return map;
  }, [shape]);

  const results = useMemo(() => rank(all, query), [all, query]);

  // One DOM call on mount. No state is set here, so there is no cascading
  // render to guard against.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node || node.open) return;
    node.showModal();
    // The dialog takes focus itself; the field is what should have it.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  function go(destination: Destination | undefined) {
    if (!destination) return;
    onClose();
    router.push(destination.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[cursor]);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-label="Search the app"
      className={cn(
        "mx-auto mt-[12vh] w-[calc(100vw-2rem)] max-w-lg rounded-[var(--radius-lg)] border border-border",
        "bg-surface p-0 text-text shadow-[var(--elev-4)]",
        "backdrop:bg-black/50 backdrop:backdrop-blur-[2px]",
      )}
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search size={16} className="shrink-0 text-text-subtle" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // Reset alongside the query rather than in an effect watching it.
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Go to…"
          aria-label="Search destinations"
          aria-controls="command-results"
          className="h-13 w-full bg-transparent text-[15px] outline-none placeholder:text-text-subtle"
        />
        <kbd className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-subtle sm:block">
          ESC
        </kbd>
      </div>

      <ul id="command-results" className="max-h-[52vh] overflow-y-auto p-2">
        {results.length === 0 ? (
          <li className="px-3 py-8 text-center">
            <p className="text-text-muted">Nothing matches “{query}”.</p>
            <p className="caption-text mt-1 text-text-subtle">
              Try a word from the screen you want — “rent”, “allergy”, “away”.
            </p>
          </li>
        ) : (
          results.map((item, index) => {
            const count =
              item.badge === "approvals"
                ? counts.approvals
                : item.badge === "notifications"
                  ? counts.notifications
                  : 0;
            return (
              <li key={item.href}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(item)}
                  aria-current={index === cursor ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left",
                    index === cursor ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <item.icon size={16} className="shrink-0 text-text-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{item.label}</span>
                    {groupOf.get(item.href) ? (
                      <span className="caption-text block truncate text-text-subtle">
                        {groupOf.get(item.href)}
                      </span>
                    ) : null}
                  </span>
                  {count > 0 ? (
                    <span className="tabular shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-fg">
                      {count}
                    </span>
                  ) : null}
                  {index === cursor ? (
                    <CornerDownLeft size={13} className="shrink-0 text-text-subtle" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </dialog>
  );
}

/**
 * Ranking, and it is deliberately simple: a label that starts with what was
 * typed beats one that merely contains it, and both beat a keyword match. A
 * fuzzy matcher would let "ao" find "Away days", and would also let it find
 * four other things — on a list of thirty destinations that is a worse trade
 * than being slightly stricter.
 */
function rank(items: Destination[], query: string): Destination[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  const scored: { item: Destination; score: number }[] = [];

  for (const item of items) {
    const label = item.label.toLowerCase();
    let score = -1;

    if (label.startsWith(needle)) score = 0;
    else if (label.includes(needle)) score = 1;
    else if (item.keywords?.some((word) => word.startsWith(needle))) score = 2;
    else if (item.keywords?.some((word) => word.includes(needle))) score = 3;
    else if (item.blurb?.toLowerCase().includes(needle)) score = 4;

    if (score >= 0) scored.push({ item, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
    .map((entry) => entry.item);
}
