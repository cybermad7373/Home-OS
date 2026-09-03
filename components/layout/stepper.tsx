import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Back, a label, forward.
 *
 * Every screen that steps through time — the Calendar's three views, the chore
 * week, the month a ledger is showing — needs the same control, and before
 * this each of them wrote its own: "← Earlier" as a text link on one, a ghost
 * button reading "← Previous" on another, a pair of chevrons somewhere else.
 * Same gesture, three shapes, three hit areas.
 *
 * They are links rather than buttons because each step is a different server
 * read with its own URL, which means the browser's own back button works and a
 * particular week can be sent to somebody.
 */
export function Stepper({
  back,
  forward,
  label,
  backLabel = "Earlier",
  forwardLabel = "Later",
}: {
  back: string;
  forward: string;
  label: string;
  backLabel?: string;
  forwardLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link
        href={back}
        aria-label={backLabel}
        className="touch-target flex items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <ChevronLeft size={17} aria-hidden />
      </Link>
      <span className="text-[15px] font-medium">{label}</span>
      <Link
        href={forward}
        aria-label={forwardLabel}
        className="touch-target flex items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <ChevronRight size={17} aria-hidden />
      </Link>
    </div>
  );
}
