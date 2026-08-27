import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { DecisionActions } from "@/components/governance/decision-actions";
import { ApiError } from "@/lib/api/errors";
import { getDecision } from "@/lib/data/governance";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import {
  DECISION_EFFECT,
  DECISION_LEVEL_LABEL,
  DECISION_STATUS_LABEL,
  DECISION_TYPE_LABEL,
} from "@/lib/types/domain";
import { formatDateTime, relativeTime } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Decision" };

/**
 * S-36 Decision detail.
 *
 * Everybody can open this screen for every decision, including the ones they
 * were never asked about — a decision only its participants can read is an
 * admin action wearing a quorum. What changes between a participant and a
 * spectator is the actions at the bottom, and nothing else.
 */
export default async function DecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const { id } = await params;

  let decision;
  try {
    decision = await getDecision(session, house.id, id, member.id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "DECISION_NOT_FOUND") notFound();
    throw error;
  }

  const timezone = house.timezone;
  const outstanding = decision.progress.outstanding;

  return (
    <>
      <PageHeader
        title={DECISION_TYPE_LABEL[decision.type]}
        subtitle={
          decision.subjectMember
            ? `About ${decision.subjectMember.displayName}`
            : undefined
        }
        action={
          <Badge
            tone={
              decision.status === "waiting"
                ? "info"
                : decision.status === "rejected"
                  ? "danger"
                  : decision.status === "applied" || decision.status === "approved"
                    ? "success"
                    : "neutral"
            }
          >
            {DECISION_STATUS_LABEL[decision.status]}
          </Badge>
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardTitle>What changes if this happens</CardTitle>
          <p className="mt-1 text-[15px]">{DECISION_EFFECT[decision.type]}</p>
          <p className="caption-text mt-2 text-text-muted">
            {DECISION_LEVEL_LABEL[decision.level]} decision
            {decision.autoApproved
              ? " · approved on the spot: there was nobody else to ask"
              : ""}
          </p>
        </Card>

        <Card>
          <CardTitle>Who proposed it</CardTitle>
          <p className="mt-1 text-[15px]">{decision.requestedBy.displayName}</p>
          <p className="caption-text text-text-muted">
            {formatDateTime(decision.createdAt, timezone)} ·{" "}
            {relativeTime(decision.createdAt)}
          </p>
          {decision.reason ? (
            <p className="mt-2 text-[15px]">&ldquo;{decision.reason}&rdquo;</p>
          ) : null}
        </Card>

        <Card>
          <CardTitle>Who is needed</CardTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {decision.participants.map((participant) => (
              <li
                key={`${participant.memberId}:${participant.capacity}`}
                className="flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px]">
                    {participant.displayName}
                    {participant.memberId === member.id ? " (you)" : ""}
                  </p>
                  <p className="caption-text text-text-muted">
                    {participant.capacity === "approver"
                      ? "Must approve"
                      : "Must acknowledge"}
                    {participant.isMandatory ? " · required" : ""}
                  </p>
                  {participant.reason ? (
                    <p className="caption-text mt-0.5 text-text-muted">
                      &ldquo;{participant.reason}&rdquo;
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {participant.response ? (
                    <>
                      <Badge
                        tone={participant.response === "reject" ? "danger" : "success"}
                      >
                        {participant.response === "approve"
                          ? "Approved"
                          : participant.response === "reject"
                            ? "Rejected"
                            : "Acknowledged"}
                      </Badge>
                      {participant.respondedAt ? (
                        <p className="caption-text mt-0.5 text-text-muted">
                          {relativeTime(participant.respondedAt)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <Badge>Waiting</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="caption-text mt-3 text-text-muted">
            {decision.progress.approvals.given} of{" "}
            {decision.progress.approvals.required} approvals
            {decision.progress.acknowledgements.required > 0
              ? ` · ${decision.progress.acknowledgements.given} of ${decision.progress.acknowledgements.required} acknowledgements`
              : ""}
            {outstanding.length > 0
              ? ` · still needed from ${outstanding.join(", ")}`
              : ""}
          </p>
        </Card>

        {decision.deadline ? (
          <Card>
            <CardTitle>Deadline</CardTitle>
            <p className="mt-1 text-[15px]">{relativeTime(decision.deadline)}</p>
            <p className="caption-text text-text-muted">
              {formatDateTime(decision.deadline, timezone)}
            </p>
          </Card>
        ) : null}

        {decision.status === "waiting" ? (
          <DecisionActions decision={decision} />
        ) : (
          <Card>
            <CardTitle>{DECISION_STATUS_LABEL[decision.status]}</CardTitle>
            <p className="caption-text mt-1 text-text-muted">
              {decision.status === "lapsed"
                ? "Nobody responded in time. Nothing changed."
                : decision.status === "cancelled"
                  ? "The person who proposed it withdrew it."
                  : decision.status === "rejected"
                    ? "It was rejected, and the reason is on the response above."
                    : decision.appliedAt
                      ? `Applied ${relativeTime(decision.appliedAt)}.`
                      : "Approved. The effect has not run yet."}
            </p>
          </Card>
        )}

        <Link href="/more/approvals" className="caption-text text-primary">
          Back to approvals
        </Link>
      </div>
    </>
  );
}
