import { formatLastDoneLabel } from "@/lib/domain/chores/last-done";
import { relativeTime } from "@/lib/utils/date";

/**
 * CH-12 — "last done 6 days ago by Arun". Confirmed completions only; a card
 * whose own instance is still awaiting confirmation reads "pending" rather
 * than an older confirmed date, and a template with none reads "never
 * completed" rather than a blank line or a creation date.
 */
export function LastDoneLine({
  instanceStatus,
  lastDoneAt,
  lastDoneByName,
}: {
  /** Omitted where there is no single instance to be pending — a template list. */
  instanceStatus?: string;
  lastDoneAt: string | null;
  lastDoneByName: string | null;
}) {
  const label = formatLastDoneLabel({ instanceStatus, lastDoneAt, lastDoneByName });

  if (label.kind === "pending") {
    return <p className="caption-text text-text-muted">Last done: pending</p>;
  }
  if (label.kind === "never") {
    return <p className="caption-text text-text-muted">Never completed</p>;
  }
  return (
    <p className="caption-text text-text-muted">
      Last done {relativeTime(label.lastDoneAt)} by {label.lastDoneByName}
    </p>
  );
}
