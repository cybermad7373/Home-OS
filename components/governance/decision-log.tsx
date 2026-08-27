import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { DecisionView } from "@/lib/data/governance";
import {
  DECISION_STATUS_LABEL,
  DECISION_TYPE_LABEL,
} from "@/lib/types/domain";
import { relativeTime } from "@/lib/utils/date";

/**
 * The house's decision record — every decision, at every status, readable by
 * everybody (docs/14-GOVERNANCE-SPEC.md §3).
 *
 * There is nothing interactive here on purpose: answering happens on the
 * Approvals queue or on the decision itself. This is the log, and it is a
 * server component because a log that needed JavaScript to be read would be a
 * log that stops existing on a bad connection.
 */
export function DecisionLog({
  decisions,
  callerMemberId,
}: {
  decisions: DecisionView[];
  callerMemberId: string;
}) {
  if (decisions.length === 0) {
    return (
      <EmptyState
        title="Nothing has been decided yet"
        body="Every proposal the house makes is kept here — who asked, who answered, and what happened — whether it passed or not."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {decisions.map((decision) => (
        <li key={decision.id}>
          <Link href={`/more/approvals/${decision.id}`}>
            <Card className="transition-colors hover:border-primary">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {DECISION_TYPE_LABEL[decision.type]}
                    {decision.subjectMember
                      ? ` — ${decision.subjectMember.displayName}`
                      : ""}
                  </p>
                  <p className="caption-text text-text-muted">
                    {decision.requestedBy.memberId === callerMemberId
                      ? "You proposed"
                      : `${decision.requestedBy.displayName} proposed`}{" "}
                    · {relativeTime(decision.createdAt)}
                    {decision.status === "waiting" &&
                    decision.progress.outstanding.length > 0
                      ? ` · waiting on ${decision.progress.outstanding.join(", ")}`
                      : ""}
                  </p>
                </div>
                <Badge
                  tone={
                    decision.status === "waiting"
                      ? "info"
                      : decision.status === "rejected"
                        ? "danger"
                        : decision.status === "applied" ||
                            decision.status === "approved"
                          ? "success"
                          : "neutral"
                  }
                >
                  {DECISION_STATUS_LABEL[decision.status]}
                </Badge>
              </div>

              {/* An approved decision whose effect has not run is not the same
                  thing as a done one, and the log says which it is (D-57). */}
              {decision.status === "approved" ? (
                <p className="caption-text mt-2 text-text-muted">
                  Approved, and not yet carried out.
                </p>
              ) : null}
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
