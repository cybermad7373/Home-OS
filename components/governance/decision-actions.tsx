"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { RejectForm } from "./reject-form";
import type { DecisionView } from "@/lib/data/governance";

const REFUSAL_COPY: Record<string, string> = {
  NOT_A_PARTICIPANT: "You were not asked about this one. You can see it, as everybody can.",
  ALREADY_RESPONDED: "You have already answered this.",
  ALREADY_RESOLVED: "This is settled. Nothing more to answer.",
};

/**
 * The actions half of S-36 — and only the caller's own actions.
 *
 * A decision that completes on this response says so before it is sent, with
 * the effect stated above it (AP-04). Everything else on the screen is the
 * record, which everybody can read whether they were asked or not.
 */
export function DecisionActions({ decision }: { decision: DecisionView }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);

    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return null;
    }
    router.refresh();
    return payload;
  }

  async function respond(kind: "approve" | "reject", reason?: string) {
    const payload = await post(`/api/decisions/${decision.id}/respond`, {
      response:
        kind === "reject"
          ? "reject"
          : decision.viewer.capacity === "acknowledger"
            ? "acknowledge"
            : "approve",
      capacity: decision.viewer.capacity ?? undefined,
      reason,
    });
    if (!payload) return;

    setRejecting(false);
    if (kind === "approve" && payload.applied === false && payload.apply_refusal) {
      toast("Recorded. The effect is not built yet.", "neutral");
    } else {
      toast(kind === "approve" ? "Recorded." : "Rejected.", kind === "approve" ? "success" : "neutral");
    }
  }

  async function cancel() {
    const payload = await post(`/api/decisions/${decision.id}/cancel`);
    if (payload) toast("Withdrawn.", "neutral");
  }

  const refusal = decision.viewer.refusal;

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {decision.viewer.completesOnMyResponse ? (
        <Alert tone="warning" title="Your answer finishes this.">
          Everybody else who was asked has answered. What happens next is
          whatever you choose here.
        </Alert>
      ) : null}

      {decision.viewer.canRespond ? (
        rejecting ? (
          <RejectForm
            busy={busy}
            onCancel={() => setRejecting(false)}
            onSubmit={(reason) => respond("reject", reason)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={busy} onClick={() => respond("approve")}>
              {decision.viewer.capacity === "acknowledger" ? "Acknowledge" : "Approve"}
            </Button>
            {decision.viewer.capacity === "approver" ? (
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </Button>
            ) : null}
          </div>
        )
      ) : refusal ? (
        <p className="caption-text text-text-muted">
          {REFUSAL_COPY[refusal] ?? "There is nothing for you to answer here."}
        </p>
      ) : null}

      {decision.viewer.canCancel ? (
        <div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>
            Withdraw this proposal
          </Button>
          <p className="caption-text text-text-muted">
            You proposed it, so you can withdraw it. Nobody else can.
          </p>
        </div>
      ) : null}
    </div>
  );
}
