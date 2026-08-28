"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { ProposeSheet, type ProposalOutcome } from "@/components/governance/propose-sheet";
import {
  RuleFields,
  emptyDraft,
  intFrom,
  paiseFrom,
  type RuleDraft,
} from "./rule-fields";
import { ruleIsExecuted } from "@/lib/types/domain";
import type { ConditionKind, ActionKind, AppliesToKind } from "@/lib/domain/rules/types";

/**
 * S-41 — write a rule.
 *
 * The order on screen is the order of the specification: **one large text area
 * first**, then the structured fields, then Submit. The text area is not a
 * summary of the fields below it — it is the rule, kept verbatim forever
 * (RL-09), and the fields are one reading of it that a person checked.
 *
 * "Understand this" runs the parse. It is **absent** rather than disabled when
 * the Home has no key or has switched rule parsing off: a disabled button with
 * an explanation is an upsell, and rules are not an AI feature (RL-08). The
 * server decides — the endpoint answers `parsed_by: "manual"` and the button
 * simply stops being offered for the rest of the session.
 *
 * Submit opens S-37. The rule does not go live here, and the sheet says so.
 */

export interface RuleFormInitial extends Partial<RuleDraft> {
  ruleId?: string;
  versionNo?: number;
}

const EXAMPLE =
  "Nobody should leave unwashed vessels overnight. If someone does, they clean the kitchen next morning.";

export function RuleForm({
  templates,
  initial,
  parseOffered = true,
}: {
  templates: string[];
  /** Present when editing: the rule and the version being edited from. */
  initial?: RuleFormInitial;
  /** False when the Home is known to have no parse available. */
  parseOffered?: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(initial?.ruleId);

  const [draft, setDraft] = useState<RuleDraft>({ ...emptyDraft(), ...initial });
  const [parsedBy, setParsedBy] = useState<"manual" | "ai">("manual");
  const [parsing, setParsing] = useState(false);
  const [canParse, setCanParse] = useState(parseOffered);
  const [flags, setFlags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const textTooShort = draft.originalText.trim().length < 3;
  const titleTooShort = draft.title.trim().length < 3;

  async function understand() {
    setParsing(true);
    setError(null);

    const response = await fetch("/api/rules/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: draft.originalText.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    setParsing(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That could not be read");
      return;
    }

    // Not an error state, and the interface must not present it as one. The
    // fields below are already there to fill in; the button stops being
    // offered because offering it again would promise something twice.
    if (payload.parsed_by !== "ai" || !payload.proposal) {
      setCanParse(false);
      return;
    }

    const proposal = payload.proposal;
    setParsedBy("ai");
    setFlags(payload.flags ?? []);
    setDraft((current) => ({
      ...current,
      title: proposal.title ?? current.title,
      conditionKind: proposal.condition?.kind ?? current.conditionKind,
      conditionDetail: conditionDetailOf(proposal.condition) || current.conditionDetail,
      actionKind: proposal.action?.kind ?? current.actionKind,
      actionText:
        proposal.action?.text ?? proposal.action?.description ?? current.actionText,
      appliesToKind: proposal.applies_to?.kind ?? current.appliesToKind,
      appliesToValue: proposal.applies_to?.value ?? current.appliesToValue,
      weightPoints:
        proposal.weight_points === null ? "" : String(proposal.weight_points),
      penaltyRupees:
        proposal.penalty_paise === null ? "" : String(proposal.penalty_paise / 100),
    }));
  }

  function body(reason: string) {
    return {
      title: draft.title.trim(),
      original_text: draft.originalText.trim(),
      condition: conditionFrom(draft),
      action: actionFrom(draft),
      applies_to: appliesToFrom(draft),
      weight_points: intFrom(draft.weightPoints),
      penalty_paise: paiseFrom(draft.penaltyRupees),
      starts_on: draft.startsOn || null,
      ends_on: draft.endsOn || null,
      parsed_by: parsedBy,
      reason,
      ...(editing ? { change_reason: reason } : {}),
    };
  }

  async function submit(reason: string): Promise<ProposalOutcome> {
    const response = await fetch(
      editing ? `/api/rules/${initial!.ruleId}` : "/api/rules",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(reason)),
      },
    );
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

  const executed = ruleIsExecuted(draft.conditionKind, draft.actionKind);

  return (
    <>
      <Card className="mb-4">
        <Field
          label="The rule, in your own words"
          htmlFor="rule-text"
          hint="kept exactly as you write it"
        >
          <textarea
            id="rule-text"
            rows={4}
            maxLength={1000}
            value={draft.originalText}
            placeholder={EXAMPLE}
            onChange={(event) =>
              setDraft((current) => ({ ...current, originalText: event.target.value }))
            }
            className="w-full rounded-[10px] border border-border bg-surface-2 p-3 text-[15px] text-text placeholder:text-text-subtle focus:bg-surface"
          />
        </Field>

        {canParse ? (
          <Button
            variant="secondary"
            block
            loading={parsing}
            disabled={textTooShort}
            onClick={understand}
          >
            Understand this
          </Button>
        ) : null}

        {parsedBy === "ai" ? (
          <p className="caption-text mt-2 text-text-muted">
            This is a suggestion. Check it before you submit.
          </p>
        ) : null}

        {flags.includes("applies_to") ? (
          <div className="mt-3">
            <Alert tone="warning">
              It could not tell who this applies to, so it says everyone. Change it
              below if that is wrong.
            </Alert>
          </div>
        ) : null}
      </Card>

      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Card className="mb-4">
        <RuleFields draft={draft} onChange={setDraft} templates={templates} />

        <p className="caption-text text-text-muted">
          {executed
            ? "The house acts on this one: it feeds the schedule, the points or the settlement."
            : "This one is written down and agreed, not automated. The house can point at it."}
        </p>
      </Card>

      <Button
        block
        disabled={textTooShort || titleTooShort}
        onClick={() => setConfirming(true)}
      >
        {editing ? "Submit the change" : "Submit"}
      </Button>

      <Button block variant="ghost" className="mt-2" onClick={() => router.back()}>
        Cancel
      </Button>

      {confirming ? (
        <ProposeSheet
          draft={{ type: "change_rule" }}
          title={editing ? "Change this rule" : "Add this rule"}
          summary={
            editing
              ? `The house is asked to accept version ${(initial?.versionNo ?? 1) + 1} of “${draft.title.trim()}”. The version in force stays in force until it does.`
              : `The house is asked to accept “${draft.title.trim()}”. It is not a rule until they answer.`
          }
          submitLabel="Ask the home"
          submit={submit}
          onClose={() => setConfirming(false)}
          onProposed={() => {
            router.push("/more/rules");
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Draft to request body
// ---------------------------------------------------------------------------

function conditionFrom(draft: RuleDraft): Record<string, unknown> {
  const kind: ConditionKind = draft.conditionKind;
  const detail = draft.conditionDetail.trim();
  if (!detail) return { kind };

  switch (kind) {
    case "chore_missed":
      return { kind, template: detail };
    case "state_at_time":
      return { kind, state: detail };
    case "time_of_day":
      return { kind, after: detail };
    case "spend_exceeds": {
      const paise = paiseFrom(detail);
      return paise === null ? { kind } : { kind, amount_paise: paise };
    }
    default:
      return { kind, description: detail };
  }
}

function actionFrom(draft: RuleDraft): Record<string, unknown> {
  const kind: ActionKind = draft.actionKind;
  const text = draft.actionText.trim();
  if (!text) return { kind };
  return kind === "other" ? { kind, description: text } : { kind, text };
}

function appliesToFrom(draft: RuleDraft): Record<string, unknown> {
  const kind: AppliesToKind = draft.appliesToKind;
  const value = draft.appliesToValue.trim();
  return value ? { kind, value } : { kind };
}

function conditionDetailOf(condition: Record<string, unknown> | undefined): string {
  if (!condition) return "";
  for (const key of ["template", "state", "after", "description"]) {
    const value = condition[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}
