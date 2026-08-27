import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { LlmRunSummary } from "@/lib/data/llm";

/**
 * Section 9 of docs/10-LLM-SPEC.md — what the admin sees about the overlay.
 *
 * Acceptance rate over the last twelve generations, the failure codes that
 * recur, and the last rejected proposal with the constraints it broke. The
 * documented trigger for revisiting the prompt is an acceptance rate below 50
 * per cent, so the number is stated plainly rather than buried in a chart.
 */
export function LlmRunsPanel({ summary }: { summary: LlmRunSummary | null }) {
  if (!summary || summary.total === 0) return null;

  const rate = Math.round((summary.accepted / summary.total) * 100);

  return (
    <Card className="mb-3">
      <CardTitle>The model&apos;s schedules</CardTitle>
      <CardDescription>
        {summary.accepted} of the last {summary.total} proposals were published;{" "}
        {summary.total - summary.accepted} were discarded and the engine&apos;s schedule
        used instead. Average round trip {summary.avgLatencyMs} ms.
      </CardDescription>

      {rate < 50 ? (
        <p className="caption-text mt-2 text-warning">
          Below half accepted. That is the documented point at which the prompt or the
          model needs changing — not the constraints.
        </p>
      ) : null}

      {summary.failureCodes.length > 0 ? (
        <ul className="caption-text mt-3 flex flex-wrap gap-2 text-text-muted">
          {summary.failureCodes.slice(0, 6).map((entry) => (
            <li key={entry.code} className="rounded-full bg-surface-2 px-2 py-0.5">
              {entry.code} × {entry.count}
            </li>
          ))}
        </ul>
      ) : null}

      {summary.lastRejection ? (
        <p className="caption-text mt-3 text-text-muted">
          Last rejection: {summary.lastRejection.errors.slice(0, 4).join(", ")}
          {summary.lastRejection.errors.length > 4 ? ", …" : ""}
        </p>
      ) : null}
    </Card>
  );
}
