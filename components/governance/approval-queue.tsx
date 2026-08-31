"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { RejectForm } from "./reject-form";
import { splitQueue } from "@/lib/domain/governance/queue";
import type { DecisionView } from "@/lib/data/governance";
import {
  DECISION_EFFECT,
  DECISION_TYPE_LABEL,
  QUEUE_GROUP_LABEL,
} from "@/lib/types/domain";
import { relativeTime } from "@/lib/utils/date";

/**
 * S-35 Approvals — the single queue.
 *
 * The one rule this screen must not be trusted to hold alone is held twice:
 * `splitQueue` keeps a Critical decision that completes on this caller out of
 * the batched sections, and `POST /api/decisions/approve-all` plans the batch
 * again on the server, from the same domain function, ignoring anything the
 * browser sends. A client that skipped this file cannot close a settlement
 * with one tap either.
 */
export function ApprovalQueue({
  decisions,
  approvable,
}: {
  decisions: DecisionView[];
  approvable: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [batching, setBatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const split = splitQueue(
    decisions.map((decision) => ({
      id: decision.id,
      type: decision.type,
      level: decision.level,
      completesOnMyResponse: decision.viewer.completesOnMyResponse,
      decision,
    })),
  );

  async function respond(
    decision: DecisionView,
    kind: "approve" | "reject",
    reason?: string,
  ) {
    setBusyId(decision.id);
    setError(null);

    const response = await fetch(`/api/decisions/${decision.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response:
          kind === "reject"
            ? "reject"
            : decision.viewer.capacity === "acknowledger"
              ? "acknowledge"
              : "approve",
        capacity: decision.viewer.capacity ?? undefined,
        reason,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return;
    }

    setRejecting(null);
    // An approved decision whose effect is not built yet says so rather than
    // claiming something happened: the decision passed, and nothing ran.
    if (kind === "approve" && payload?.applied === false && payload?.apply_refusal) {
      toast("Recorded. The effect is not built yet.", "neutral");
    } else {
      toast(
        kind === "approve" ? "Recorded." : "Rejected.",
        kind === "approve" ? "success" : "neutral",
      );
    }
    router.refresh();
  }

  async function approveAll() {
    setBatching(true);
    setError(null);

    const response = await fetch("/api/decisions/approve-all", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBatching(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return;
    }

    const count = Array.isArray(payload?.approved) ? payload.approved.length : 0;
    toast(count === 1 ? "One approved." : `${count} approved.`, "success");
    router.refresh();
  }

  if (decisions.length === 0) {
    return (
      <EmptyState
        illustration="generic"
        title="Nothing needs you."
        body="Decisions the house asks you about appear here — expenses, chores, absences, join requests, and anything that changes how the home works."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {approvable > 0 ? (
        <Button block loading={batching} onClick={approveAll}>
          Approve all {approvable} I can
        </Button>
      ) : null}

      {split.sections.map((section) => (
        <section key={section.group} aria-labelledby={`group-${section.group}`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id={`group-${section.group}`} className="heading-text">
              {QUEUE_GROUP_LABEL[section.group]}
            </h2>
            <span className="caption-text tabular text-text-muted">
              {section.items.length}
            </span>
          </div>

          <ul className="flex flex-col gap-3">
            {section.items.map(({ decision }) => (
              <li key={decision.id}>
                <Card>
                  <DecisionSummary decision={decision} />

                  {rejecting === decision.id ? (
                    <RejectForm
                      busy={busyId === decision.id}
                      onCancel={() => setRejecting(null)}
                      onSubmit={(reason) => respond(decision, "reject", reason)}
                    />
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        loading={busyId === decision.id}
                        onClick={() => respond(decision, "approve")}
                      >
                        {decision.viewer.capacity === "acknowledger"
                          ? "Acknowledge"
                          : "Approve"}
                      </Button>
                      {decision.viewer.capacity === "approver" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === decision.id}
                          onClick={() => setRejecting(decision.id)}
                        >
                          Reject
                        </Button>
                      ) : null}
                      <Link
                        href={`/more/approvals/${decision.id}`}
                        className="caption-text ml-auto text-primary"
                      >
                        Details
                      </Link>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {split.deliberate.length > 0 ? (
        <section aria-labelledby="group-deliberate">
          <h2 id="group-deliberate" className="heading-text mb-2">
            Needs a deliberate decision
          </h2>
          <p className="caption-text mb-3 text-text-muted">
            Approve all leaves these alone. Each one finishes the moment you
            answer it, so it is answered on its own screen.
          </p>

          <ul className="flex flex-col gap-3">
            {split.deliberate.map(({ decision }) => (
              <li key={decision.id}>
                <Card className="border-warning/40">
                  <div className="mb-1 flex items-center gap-2 text-warning">
                    <AlertTriangle size={16} aria-hidden />
                    <span className="caption-text font-medium">
                      Approving completes this.
                    </span>
                  </div>
                  <DecisionSummary decision={decision} />
                  <div className="mt-3">
                    <Link
                      href={`/more/approvals/${decision.id}`}
                      className="caption-text font-medium text-primary"
                    >
                      Review
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** What is being asked, who asked, and what changes if it happens (AP-02). */
function DecisionSummary({ decision }: { decision: DecisionView }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">
          {DECISION_TYPE_LABEL[decision.type]}
          {decision.subjectMember ? ` — ${decision.subjectMember.displayName}` : ""}
        </p>
        {decision.level === "critical" ? (
          <Badge tone="warning">Critical</Badge>
        ) : decision.level === "important" ? (
          <Badge tone="info">Important</Badge>
        ) : null}
      </div>

      <p className="caption-text text-text-muted">
        {decision.requestedBy.displayName} proposed ·{" "}
        {relativeTime(decision.createdAt)}
        {decision.deadline ? ` · ${relativeTime(decision.deadline)}` : ""}
      </p>

      {decision.reason ? (
        <p className="caption-text mt-1 text-text-muted">
          &ldquo;{decision.reason}&rdquo;
        </p>
      ) : null}

      <p className="caption-text mt-2">{DECISION_EFFECT[decision.type]}</p>

      <p className="caption-text mt-1 text-text-muted">
        {decision.progress.approvals.given} of {decision.progress.approvals.required}{" "}
        approvals
        {decision.progress.acknowledgements.required > 0
          ? ` · ${decision.progress.acknowledgements.given} of ${decision.progress.acknowledgements.required} acknowledgements`
          : ""}
      </p>
    </>
  );
}
