"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  deadlinePhrase,
  expectationLine,
  responsesPhrase,
  type ProposalAsk,
} from "@/lib/domain/governance/preview";
import { DECISION_ACTION_PHRASE } from "@/lib/types/domain";
import type { DecisionType, ResponseCapacity } from "@/lib/domain/governance/types";

interface PreviewParticipant {
  memberId: string;
  displayName: string;
  capacity: ResponseCapacity;
  isMandatory: boolean;
}

interface Preview extends ProposalAsk {
  participants: PreviewParticipant[];
  reasonRequired: boolean;
}

/** What is being proposed. The same shape `POST /api/decisions` takes. */
export interface ProposalDraft {
  type: DecisionType;
  subject_member_id?: string;
  subject_type?: string;
  subject_id?: string;
  payload?: Record<string, unknown>;
}

const MIN_REASON = 3;

/**
 * S-37 — propose a decision.
 *
 * Opened from the action that needs it, never reached on its own. Three things
 * are shown before the person commits to asking: what will be proposed, who
 * will be asked, and how many of them have to answer. The last line is the one
 * that matters most to somebody who has just tapped a button labelled Remove
 * and has not yet realised it removed nobody.
 *
 * The preview is a server call rather than a guess: the participants come from
 * the same selector the proposal will run, so the list here is the list the
 * decision gets.
 */
/** What a proposal came back as, whichever endpoint made it. */
export interface ProposalOutcome {
  decisionId: string;
  autoApproved: boolean;
  applied: boolean;
}

export function ProposeSheet({
  draft,
  title,
  summary,
  effect,
  submitLabel,
  submit,
  onClose,
  onProposed,
}: {
  draft: ProposalDraft;
  /** The sheet's own heading. */
  title: string;
  /** One sentence: what is being proposed, in the Home's words. */
  summary: string;
  /** S-36's "what changes if this happens", when the caller can compute it. */
  effect?: ReactNode;
  submitLabel?: string;
  /**
   * Where the proposal is actually sent, when it is not `POST /api/decisions`.
   *
   * Some proposals are made by an endpoint that has other rows to write in the
   * same breath — `POST /api/rules` writes a rule and its first version and
   * *then* asks the Home, and the three have to succeed or fail together. The
   * sheet still owns the preview, the reason field and the three outcomes,
   * because those are the same wherever the decision came from; only the one
   * request differs.
   */
  submit?: (reason: string) => Promise<ProposalOutcome>;
  onClose: () => void;
  /** Given the created decision's id. Defaults to opening it. */
  onProposed?: (decisionId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The type and the subject are the whole of the question, so the preview is
  // fetched once per pair rather than on every keystroke in the reason field.
  const type = draft.type;
  const subjectMemberId = draft.subject_member_id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/decisions/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subject_member_id: subjectMemberId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (cancelled) return;

      if (!response.ok) {
        setError(payload?.error?.message ?? "This could not be worked out");
        return;
      }
      setPreview(payload as Preview);
    })();
    return () => {
      cancelled = true;
    };
  }, [type, subjectMemberId]);

  async function propose() {
    setSending(true);
    setError(null);

    let outcome: ProposalOutcome;
    try {
      outcome = submit
        ? await submit(reason.trim())
        : await proposeHere(draft, reason.trim());
    } catch (failure) {
      setSending(false);
      setError((failure as Error).message || "That did not go through");
      return;
    }
    setSending(false);

    // Three outcomes, and they are said apart. A Home with nobody to ask has
    // already done the thing; a Home with people to ask has not.
    if (outcome.autoApproved) {
      toast(
        outcome.applied
          ? "Done, and recorded — there was nobody to ask."
          : "Recorded. The effect is not built yet.",
        outcome.applied ? "success" : "neutral",
      );
    } else {
      toast("Asked. Nothing changes until they answer.", "success");
    }

    onClose();
    if (onProposed) {
      onProposed(outcome.decisionId);
      return;
    }
    router.push(`/more/approvals/${outcome.decisionId}`);
    router.refresh();
  }

  const needsReason = preview?.reasonRequired ?? false;
  const reasonTooShort = reason.trim().length < MIN_REASON;

  return (
    <BottomSheet open title={title} onClose={onClose}>
      <p className="mb-3">{summary}</p>

      {effect ? <div className="mb-3">{effect}</div> : null}

      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {!preview && !error ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {preview ? (
        <>
          <section className="mb-3 rounded-[var(--radius-sm)] bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="label-text">Who will be asked</p>
              <Badge tone={preview.level === "critical" ? "warning" : "neutral"}>
                {preview.level === "critical" ? "Critical" : "Needs a response"}
              </Badge>
            </div>

            {preview.participants.length > 0 ? (
              <ul className="divide-y divide-border">
                {preview.participants.map((participant) => (
                  <li
                    key={`${participant.memberId}:${participant.capacity}`}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="truncate">{participant.displayName}</span>
                    <span className="caption-text shrink-0 text-text-muted">
                      {participant.capacity === "approver"
                        ? "must approve"
                        : "must acknowledge"}
                      {participant.isMandatory ? " · required" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="caption-text text-text-muted">
                Nobody — you are the only adult member here.
              </p>
            )}

            <p className="caption-text mt-2 text-text-muted">
              {responsesPhrase(preview)
                ? `It needs ${responsesPhrase(preview)}.`
                : "There is nothing to collect."}
              {deadlinePhrase(preview.deadlineHours)
                ? ` They have ${deadlinePhrase(preview.deadlineHours)} to answer.`
                : ""}
            </p>
          </section>

          <Field
            label={needsReason ? "Why?" : "Why? (optional)"}
            htmlFor="propose-reason"
            hint={
              needsReason
                ? "The record keeps this, and the people asked read it first"
                : undefined
            }
          >
            <Input
              id="propose-reason"
              value={reason}
              autoFocus
              placeholder={`Why you want to ${DECISION_ACTION_PHRASE[draft.type]}`}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <p className="caption-text mb-3 text-text-muted">{expectationLine(preview)}</p>

          <Button
            block
            loading={sending}
            disabled={needsReason && reasonTooShort}
            onClick={propose}
          >
            {submitLabel ?? "Ask the home"}
          </Button>
        </>
      ) : null}

      <Button block variant="ghost" className="mt-2" disabled={sending} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}

/** The ordinary path: the proposal is the whole of what is being written. */
async function proposeHere(
  draft: ProposalDraft,
  reason: string,
): Promise<ProposalOutcome> {
  const response = await fetch("/api/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...draft, reason: reason || undefined }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "That did not go through");
  }

  return {
    decisionId: payload.decision.id,
    autoApproved: Boolean(payload.decision.autoApproved),
    applied: Boolean(payload.applied),
  };
}
