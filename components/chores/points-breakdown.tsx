"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/sheet";
import type { PointBreakdown } from "@/lib/domain/insights";

/**
 * EF-12 — every points figure opens to the dated records that produced it.
 *
 * The figure itself is the button, so there is nothing extra to find: the
 * number a member is questioning is the thing they tap.
 *
 * Two behaviours the criterion names explicitly:
 *
 *   * **A zero is explained as readily as a total.** An empty list is a
 *     complete answer, and it says so in words rather than showing a blank
 *     panel that reads as a failure to load.
 *   * **The components sum exactly to the figure.** The screen sends the figure
 *     it displayed, and the answer reports whether the records agree with it.
 *     If they do not, the sheet says so instead of listing rows that quietly
 *     add up to something else.
 */
export function PointsBreakdownButton({
  memberId,
  displayName,
  points,
  from,
  to,
  className,
}: {
  memberId: string;
  displayName: string;
  points: number;
  from: string;
  to: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<PointBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    setError(null);
    setBreakdown(null);
    try {
      const params = new URLSearchParams({
        member: memberId,
        from,
        to,
        points: String(points),
      });
      const response = await fetch(`/api/insights/points?${params.toString()}`);
      if (!response.ok) throw new Error("failed");
      setBreakdown((await response.json()) as PointBreakdown);
    } catch {
      setError("Could not load the records behind this figure. Try again in a moment.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        aria-label={`How ${displayName} earned ${points} points`}
        className={className ?? "tabular text-[13px] font-semibold underline decoration-dotted"}
      >
        {points}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={`${displayName}'s points`}>
        {error ? <p className="text-danger">{error}</p> : null}

        {!error && !breakdown ? <p className="text-text-muted">Looking it up…</p> : null}

        {breakdown ? (
          <div className="flex flex-col gap-3">
            <p className="caption-text text-text-muted">
              {from} to {to}
            </p>

            {breakdown.components.length === 0 ? (
              <p>
                No confirmed chores in this range, so the figure is zero. Points are earned when
                somebody else confirms a chore was done.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {breakdown.components.map((component, index) => (
                  <li
                    key={`${component.date}-${component.label}-${index}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{component.label}</span>
                      <span className="caption-text text-text-muted">{component.date}</span>
                    </span>
                    <span className="tabular shrink-0 font-semibold">{component.points}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-t border-border pt-3 font-semibold">
              {breakdown.componentPoints} points in total
            </p>

            {breakdown.reconciles ? null : (
              <p className="text-warning">
                These records add up to {breakdown.componentPoints}, not the {points} shown. The
                screen is out of date — reload it.
              </p>
            )}
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
