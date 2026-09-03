"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  describeAction,
  describeAppliesTo,
  describeCondition,
  rupees,
} from "@/lib/domain/rules/diff";
import type { RuleProposal } from "@/lib/domain/rules/types";
import { RULE_STATUS_LABEL, RULE_STATUS_TONE } from "@/lib/types/domain";
import { formatDate } from "@/lib/utils/date";

/**
 * S-40 — the rules list.
 *
 * Individually editable, individually disableable, never one blob (RL-05). Each
 * row is its own rule with its own three actions, and a rule the Home is being
 * asked about carries a chip while **its current version stays in force
 * underneath** — which is the true state of things and the reason the chip says
 * "waiting for the house" rather than greying the row out.
 */

export interface RuleVersionItem {
  id: string;
  versionNo: number;
  originalText: string;
  title: string;
  condition: RuleProposal["condition"];
  action: RuleProposal["action"];
  appliesTo: RuleProposal["appliesTo"];
  weightPoints: number | null;
  penaltyPaise: number | null;
  startsOn: string | null;
  endsOn: string | null;
  activatedAt: string | null;
}

export interface RuleItem {
  id: string;
  title: string;
  status: "draft" | "proposed" | "active" | "disabled" | "superseded";
  current: RuleVersionItem | null;
  pending: { decisionId: string; versionId: string; action: string } | null;
}

const MIN_REASON = 3;

export function RuleList({
  rules,
  isLead,
  timezone,
}: {
  rules: RuleItem[];
  isLead: boolean;
  timezone: string;
}) {
  const [switching, setSwitching] = useState<{ rule: RuleItem; enable: boolean } | null>(
    null,
  );

  if (rules.length === 0) {
    return (
      <EmptyState
        title="No rules yet"
        body={
          isLead
            ? "Write down the things this home already expects of each other. Everyone acknowledges them once, and then they are on a screen instead of in an argument."
            : "Nobody has written the house rules down yet."
        }
        action={
          isLead ? (
            <Link href="/more/rules/new">
              <Button>Add a rule</Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {rules.map((rule) => (
          <li key={rule.id}>
            <RuleRow
              rule={rule}
              isLead={isLead}
              timezone={timezone}
              onSwitch={(enable) => setSwitching({ rule, enable })}
            />
          </li>
        ))}
      </ul>

      {isLead ? (
        <Link href="/more/rules/new" className="mt-4 block">
          <Button block variant="secondary">
            Add a rule
          </Button>
        </Link>
      ) : null}

      {switching ? (
        <SwitchSheet
          rule={switching.rule}
          enable={switching.enable}
          onClose={() => setSwitching(null)}
        />
      ) : null}
    </>
  );
}

function RuleRow({
  rule,
  isLead,
  timezone,
  onSwitch,
}: {
  rule: RuleItem;
  isLead: boolean;
  timezone: string;
  onSwitch: (enable: boolean) => void;
}) {
  const version = rule.current;
  const live = rule.status === "active";

  return (
    <Card className={live ? undefined : "border-dashed"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* A rule that is not in force is drawn on a dashed edge rather than
              prefixed with a tick or an empty circle — the same mark a planned
              meal gets, for the same reason: it is an intention, not a fact. */}
          <p className="font-medium">{rule.title}</p>
          <p className="caption-text text-text-muted">
            {version
              ? `v${version.versionNo}${
                  version.activatedAt
                    ? ` · since ${formatDate(version.activatedAt.slice(0, 10), timezone)}`
                    : ""
                }`
              : "Not in force yet"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={RULE_STATUS_TONE[rule.status]}>{RULE_STATUS_LABEL[rule.status]}</Badge>
          {rule.pending ? (
            <Link href={`/more/approvals/${rule.pending.decisionId}`}>
              <Badge>Waiting for the house</Badge>
            </Link>
          ) : null}
        </div>
      </div>

      {version ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-text-muted">When</dt>
          <dd>{describeCondition(version)}</dd>
          <dt className="text-text-muted">Then</dt>
          <dd>{describeAction(version)}</dd>
          <dt className="text-text-muted">Who</dt>
          <dd>{describeAppliesTo(version)}</dd>
          {version.penaltyPaise !== null ? (
            <>
              <dt className="text-text-muted">Penalty</dt>
              <dd>{rupees(version.penaltyPaise)}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/more/rules/${rule.id}/history`}>
          <Button size="sm" variant="ghost">
            History
          </Button>
        </Link>

        {isLead ? (
          <>
            <Link href={`/more/rules/${rule.id}/edit`}>
              <Button size="sm" variant="ghost">
                Edit
              </Button>
            </Link>

            {version ? (
              <Button size="sm" variant="ghost" onClick={() => onSwitch(!live)}>
                {live ? "Disable" : "Put back"}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Disabling and re-enabling both go to the Home, so both ask for a reason
 * before they go anywhere. Stopping a rule the whole Home acknowledged is not
 * an Admin preference — it is the same size of decision as making it.
 */
function SwitchSheet({
  rule,
  enable,
  onClose,
}: {
  rule: RuleItem;
  enable: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);

    const response = await fetch(
      `/api/rules/${rule.id}/${enable ? "enable" : "disable"}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setSending(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not go through");
      return;
    }

    toast(
      payload.applied
        ? enable
          ? "Back in force."
          : "Disabled, and kept in the history."
        : "Asked. Nothing changes until they answer.",
      "success",
    );
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet
      open
      title={enable ? "Put this rule back" : "Disable this rule"}
      onClose={onClose}
    >
      <p className="mb-3">
        {enable
          ? `“${rule.title}” goes back into force once the house agrees.`
          : `“${rule.title}” stops applying once the house agrees. It stays readable, with the dates it was in force.`}
      </p>

      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Field
        label="Why?"
        htmlFor="rule-switch-reason"
        hint="the record keeps this, and the people asked read it first"
      >
        <Input
          id="rule-switch-reason"
          value={reason}
          autoFocus
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      <Button
        block
        loading={sending}
        disabled={reason.trim().length < MIN_REASON}
        onClick={send}
      >
        Ask the home
      </Button>
      <Button block variant="ghost" className="mt-2" disabled={sending} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}
