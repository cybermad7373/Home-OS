"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import { ProposeSheet, type ProposalDraft } from "@/components/governance/propose-sheet";
import { formatMoney, rupeesToPaise } from "@/lib/utils/money";
import type { ProposalContext } from "@/lib/data/proposals";
import type { DecisionType } from "@/lib/domain/governance/types";

/**
 * S-37b — propose one of the decisions that had no way in.
 *
 * `ProposeSheet` was mounted in two files, so two of the fifteen decision
 * types could be started from a screen. Seven more were implemented end to end
 * — the effect in SQL, the participants in the selector, the row in the log —
 * and unreachable: the Home could read its own history of governance changes
 * and reserve draws and had no way to make another one.
 *
 * All seven are Critical, so all seven are a lead's to propose (`assertMayPropose`),
 * and every one of them ends at the same place: the sheet that says who will
 * be asked and how many of them have to answer before anything moves.
 *
 * The forms carry the Home's current values rather than blank fields. A
 * governance change is an edit, and a payload built from an empty form would
 * propose resetting eight settings in order to move one.
 */

type Kind = Extract<
  DecisionType,
  | "change_governance"
  | "change_home_mode"
  | "change_confirmation_policy"
  | "balance_adjustment"
  | "set_expected_contribution"
  | "create_reserve"
  | "reserve_draw"
>;

interface KindMeta {
  kind: Kind;
  title: string;
  body: string;
  /** Why it cannot be started right now, when it cannot. */
  blocked?: (context: ProposalContext) => string | null;
}

const KINDS: KindMeta[] = [
  {
    kind: "change_governance",
    title: "Change how decisions are made",
    body: "How many people a Critical decision needs, whether a co-admin must be among them, and how long anybody has to answer.",
  },
  {
    kind: "change_home_mode",
    title: "Change how the home works",
    body: "Whether this is a shared flat or a family home, whether money is split or pooled, and whether chores are scored.",
  },
  {
    kind: "change_confirmation_policy",
    title: "Change how chores are confirmed",
    body: "Whether a finished chore needs somebody else's word for it, and how many.",
  },
  {
    kind: "balance_adjustment",
    title: "Adjust a balance",
    body: "Move money between two people in a month that has already been settled, when the settlement got something wrong.",
    blocked: (context) =>
      context.settledPeriods.length === 0
        ? "No month has been settled yet. There is nothing to adjust until one has been closed."
        : context.members.length < 2
          ? "An adjustment moves money between two people, and this home has one."
          : null,
  },
  {
    kind: "set_expected_contribution",
    title: "Set an expected contribution",
    body: "What the home expects one person to put in each month. Setting it to zero clears it.",
    blocked: (context) =>
      context.members.length === 0 ? "There is nobody to set one for." : null,
  },
  {
    kind: "create_reserve",
    title: "Start a reserve",
    body: "A pot the home funds and spends from, separately from the month's ordinary splitting.",
  },
  {
    kind: "reserve_draw",
    title: "Draw from the reserve",
    body: "Pay an approved expense out of the pot instead of splitting it between people.",
    blocked: (context) =>
      context.reserves.length === 0
        ? "There is no reserve to draw from yet. Start one first."
        : context.drawableExpenses.length === 0
          ? "Every approved expense has already been split or drawn. A draw needs one that has not."
          : null,
  },
];

export function ProposePicker({
  context,
  currency,
}: {
  context: ProposalContext;
  currency: string;
}) {
  const [chosen, setChosen] = useState<Kind | null>(null);

  if (chosen) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => setChosen(null)}
          icon={<ArrowLeft size={15} aria-hidden />}
        >
          All decisions
        </Button>
        <ProposalForm kind={chosen} context={context} currency={currency} />
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {KINDS.map((meta) => {
        const blocked = meta.blocked?.(context) ?? null;
        return (
          <li key={meta.kind}>
            <button
              type="button"
              disabled={blocked !== null}
              onClick={() => setChosen(meta.kind)}
              className="group flex w-full items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{meta.title}</span>
                <span className="caption-text block text-text-muted">{meta.body}</span>
                {blocked ? (
                  <span className="caption-text mt-1.5 block text-warning">{blocked}</span>
                ) : null}
              </span>
              {blocked ? null : (
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="mt-1 shrink-0 text-text-subtle transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5"
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// One form per kind
// ---------------------------------------------------------------------------

function ProposalForm({
  kind,
  context,
  currency,
}: {
  kind: Kind;
  context: ProposalContext;
  currency: string;
}) {
  switch (kind) {
    case "change_governance":
      return <GovernanceForm context={context} />;
    case "change_home_mode":
      return <HomeModeForm context={context} />;
    case "change_confirmation_policy":
      return <ConfirmationForm context={context} />;
    case "balance_adjustment":
      return <AdjustmentForm context={context} currency={currency} />;
    case "set_expected_contribution":
      return <ExpectationForm context={context} currency={currency} />;
    case "create_reserve":
      return <ReserveForm />;
    case "reserve_draw":
      return <DrawForm context={context} currency={currency} />;
  }
}

/**
 * The two halves every form has: what it is proposing, and the sheet that
 * asks the Home. Kept here so seven forms cannot drift into seven layouts.
 */
function Ask({
  title,
  summary,
  draft,
  disabled,
  children,
}: {
  title: string;
  summary: string;
  draft: ProposalDraft | null;
  disabled?: string | null;
  children: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);

  return (
    <>
      <h2 className="title-text mb-1">{title}</h2>
      <p className="caption-text mb-5 text-text-muted">{summary}</p>

      {children}

      {disabled ? (
        <div className="mt-4">
          <Alert tone="warning">{disabled}</Alert>
        </div>
      ) : null}

      <Button
        block
        className="mt-6"
        disabled={disabled !== null && disabled !== undefined}
        onClick={() => setAsking(true)}
      >
        Ask the home
      </Button>

      {asking && draft ? (
        <ProposeSheet
          draft={draft}
          title={title}
          summary={summary}
          submitLabel="Ask the home"
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}

function GovernanceForm({ context }: { context: ProposalContext }) {
  const policy = context.policy;
  const [requiresCoadmin, setRequiresCoadmin] = useState(policy.criticalRequiresCoadmin);
  const [rule, setRule] = useState(policy.criticalMemberRule);
  const [value, setValue] = useState(String(policy.criticalMemberValue));
  const [requiresAll, setRequiresAll] = useState(policy.governanceRequiresAll);
  const [approvals, setApprovals] = useState(String(policy.expenseApprovalsRequired));
  const [deadlineDays, setDeadlineDays] = useState(String(policy.decisionDeadlineDays));
  const [absenceHours, setAbsenceHours] = useState(String(policy.absenceDeadlineHours));

  // Only what moved. An absent key keeps its current value in the effect, so
  // sending the whole policy would make every proposal a proposal to confirm
  // eight settings — and the decision log would stop saying what changed.
  const payload = useMemo(() => {
    const next: Record<string, unknown> = {};
    if (requiresCoadmin !== policy.criticalRequiresCoadmin)
      next.critical_requires_coadmin = requiresCoadmin;
    if (rule !== policy.criticalMemberRule) next.critical_member_rule = rule;
    if (Number(value) !== policy.criticalMemberValue)
      next.critical_member_value = Number(value);
    if (requiresAll !== policy.governanceRequiresAll)
      next.governance_requires_all = requiresAll;
    if (Number(approvals) !== policy.expenseApprovalsRequired)
      next.expense_approvals_required = Number(approvals);
    if (Number(deadlineDays) !== policy.decisionDeadlineDays)
      next.decision_deadline_days = Number(deadlineDays);
    if (Number(absenceHours) !== policy.absenceDeadlineHours)
      next.absence_deadline_hours = Number(absenceHours);
    return next;
  }, [
    policy,
    requiresCoadmin,
    rule,
    value,
    requiresAll,
    approvals,
    deadlineDays,
    absenceHours,
  ]);

  const changed = Object.keys(payload).length;

  return (
    <Ask
      title="Change how decisions are made"
      summary="The home is asked to change its own rules for changing things. Nothing here moves until it answers."
      draft={{ type: "change_governance", payload }}
      disabled={changed === 0 ? "Nothing has changed yet." : null}
    >
      <SwitchRow
        label="A Critical decision needs a co-admin among its approvers"
        checked={requiresCoadmin}
        onChange={setRequiresCoadmin}
      />
      <SwitchRow
        label="A governance change needs every eligible member to answer"
        checked={requiresAll}
        onChange={setRequiresAll}
      />

      <Field
        label="How the member requirement is counted"
        htmlFor="critical_member_rule"
        hint="a proportion of the home, or a flat count of people"
      >
        <Select
          id="critical_member_rule"
          value={rule}
          onChange={(event) =>
            setRule(event.target.value as typeof policy.criticalMemberRule)
          }
        >
          <option value="proportion">A proportion of the home</option>
          <option value="count">A number of people</option>
        </Select>
      </Field>

      <Field
        label={rule === "proportion" ? "Percent who must approve" : "People who must approve"}
        htmlFor="critical_member_value"
      >
        <Input
          id="critical_member_value"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>

      <Field label="Approvals an expense needs" htmlFor="expense_approvals_required">
        <Input
          id="expense_approvals_required"
          inputMode="numeric"
          value={approvals}
          onChange={(event) => setApprovals(event.target.value)}
        />
      </Field>

      <Field
        label="Days a decision stays open"
        htmlFor="decision_deadline_days"
        hint="after this it lapses rather than waiting for ever"
      >
        <Input
          id="decision_deadline_days"
          inputMode="numeric"
          value={deadlineDays}
          onChange={(event) => setDeadlineDays(event.target.value)}
        />
      </Field>

      <Field label="Hours an absence request stays open" htmlFor="absence_deadline_hours">
        <Input
          id="absence_deadline_hours"
          inputMode="numeric"
          value={absenceHours}
          onChange={(event) => setAbsenceHours(event.target.value)}
        />
      </Field>
    </Ask>
  );
}

function HomeModeForm({ context }: { context: ProposalContext }) {
  const [homeType, setHomeType] = useState(context.homeType);
  const [moneyMode, setMoneyMode] = useState(context.moneyMode);
  const [effortMode, setEffortMode] = useState(context.effortMode);
  const [penalty, setPenalty] = useState(context.penaltyEnabled);

  const payload = useMemo(() => {
    const next: Record<string, unknown> = {};
    if (homeType !== context.homeType) next.home_type = homeType;
    if (moneyMode !== context.moneyMode) next.money_mode = moneyMode;
    if (effortMode !== context.effortMode) next.effort_mode = effortMode;
    if (penalty !== context.penaltyEnabled) next.penalty_enabled = penalty;
    return next;
  }, [context, homeType, moneyMode, effortMode, penalty]);

  const changed = Object.keys(payload).length;

  return (
    <Ask
      title="Change how the home works"
      summary="What kind of home this is, and what it does with money and effort. It changes what every screen in the app means, so the whole home is asked."
      draft={{ type: "change_home_mode", payload }}
      disabled={changed === 0 ? "Nothing has changed yet." : null}
    >
      <Field label="What kind of home is it" htmlFor="home_type">
        <Select
          id="home_type"
          value={homeType}
          onChange={(event) => setHomeType(event.target.value as typeof homeType)}
        >
          <option value="shared">Flatmates sharing a place</option>
          <option value="family">A family home</option>
        </Select>
      </Field>

      <Field
        label="Money"
        htmlFor="money_mode"
        hint="split ends the month with who owes whom; a pot ends it owing nobody"
      >
        <Select
          id="money_mode"
          value={moneyMode}
          onChange={(event) => setMoneyMode(event.target.value as typeof moneyMode)}
        >
          <option value="split">Everyone pays their own share</option>
          <option value="pot">Spending comes out of one pot</option>
        </Select>
      </Field>

      <Field
        label="Effort"
        htmlFor="effort_mode"
        hint="points score the week; a rota only takes turns"
      >
        <Select
          id="effort_mode"
          value={effortMode}
          onChange={(event) => setEffortMode(event.target.value as typeof effortMode)}
        >
          <option value="points">Chores are scored in points</option>
          <option value="rota">Chores are a rota, unscored</option>
        </Select>
      </Field>

      <SwitchRow
        label="Falling behind on chores costs money at month end"
        checked={penalty}
        onChange={setPenalty}
      />
    </Ask>
  );
}

const CONFIRMATION_LABEL: Record<ProposalContext["confirmationPolicy"], string> = {
  size_aware: "Bigger jobs need somebody else's word for it",
  single: "Every finished chore needs one other person",
  off: "Nothing needs confirming — done is done",
};

function ConfirmationForm({ context }: { context: ProposalContext }) {
  const [policy, setPolicy] = useState(context.confirmationPolicy);
  const changed = policy !== context.confirmationPolicy;

  return (
    <Ask
      title="Change how chores are confirmed"
      summary="Whether finishing a chore is something you can say on your own, or something the home has to see."
      draft={{
        type: "change_confirmation_policy",
        payload: { confirmation_policy: policy },
      }}
      disabled={changed ? null : "Nothing has changed yet."}
    >
      <Field label="What a finished chore needs" htmlFor="confirmation_policy">
        <Select
          id="confirmation_policy"
          value={policy}
          onChange={(event) => setPolicy(event.target.value as typeof policy)}
        >
          {(Object.keys(CONFIRMATION_LABEL) as (keyof typeof CONFIRMATION_LABEL)[]).map(
            (value) => (
              <option key={value} value={value}>
                {CONFIRMATION_LABEL[value]}
              </option>
            ),
          )}
        </Select>
      </Field>
    </Ask>
  );
}

function AdjustmentForm({
  context,
  currency,
}: {
  context: ProposalContext;
  currency: string;
}) {
  const [periodId, setPeriodId] = useState(context.settledPeriods[0]?.id ?? "");
  const [fromId, setFromId] = useState(context.members[0]?.id ?? "");
  const [toId, setToId] = useState(context.members[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const paise = safePaise(amount);
  const problem =
    fromId === toId
      ? "Pick two different people. An adjustment moves money between them."
      : paise === null || paise <= 0
        ? "Enter the amount to move."
        : reason.trim().length < 3
          ? "Say what the settlement got wrong."
          : null;

  return (
    <Ask
      title="Adjust a balance"
      summary="A closed month is a record, so it is corrected rather than rewritten: this adds a transfer on top of it and says why."
      draft={{
        type: "balance_adjustment",
        subject_type: "monthly_period",
        subject_id: periodId,
        payload: {
          from_member_id: fromId,
          to_member_id: toId,
          amount_paise: paise ?? 0,
          reason: reason.trim(),
        },
      }}
      disabled={problem}
    >
      <Field label="Which month" htmlFor="adjustment_period">
        <Select
          id="adjustment_period"
          value={periodId}
          onChange={(event) => setPeriodId(event.target.value)}
        >
          {context.settledPeriods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.period}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Who pays" htmlFor="adjustment_from">
        <Select
          id="adjustment_from"
          value={fromId}
          onChange={(event) => setFromId(event.target.value)}
        >
          {context.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Who receives" htmlFor="adjustment_to">
        <Select
          id="adjustment_to"
          value={toId}
          onChange={(event) => setToId(event.target.value)}
        >
          {context.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="How much"
        htmlFor="adjustment_amount"
        hint={paise ? formatMoney(paise, { currency }) : "in rupees"}
      >
        <Input
          id="adjustment_amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="250"
        />
      </Field>

      <Field
        label="What went wrong"
        htmlFor="adjustment_reason"
        hint="this is what the home reads, and what the record keeps"
      >
        <Input
          id="adjustment_reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="The gas cylinder was counted twice"
        />
      </Field>
    </Ask>
  );
}

function ExpectationForm({
  context,
  currency,
}: {
  context: ProposalContext;
  currency: string;
}) {
  const [memberId, setMemberId] = useState(context.members[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");

  const paise = safePaise(amount);
  const problem =
    paise === null
      ? "Enter an amount. Zero clears what the home expects."
      : paise < 0
        ? "An expectation cannot be negative."
        : null;

  return (
    <Ask
      title="Set an expected contribution"
      summary="What the home expects one person to put in each month. What it expected before stays on the record — this closes that and starts a new one."
      draft={{
        type: "set_expected_contribution",
        subject_member_id: memberId,
        payload: {
          member_id: memberId,
          amount_paise: paise ?? 0,
          ...(from ? { effective_from: from } : {}),
        },
      }}
      disabled={problem}
    >
      <Field label="Who" htmlFor="expectation_member">
        <Select
          id="expectation_member"
          value={memberId}
          onChange={(event) => setMemberId(event.target.value)}
        >
          {context.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="How much a month"
        htmlFor="expectation_amount"
        hint={
          paise === 0
            ? "zero clears the expectation entirely"
            : paise
              ? formatMoney(paise, { currency })
              : "in rupees"
        }
      >
        <Input
          id="expectation_amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="5000"
        />
      </Field>

      <Field
        label="From when"
        htmlFor="expectation_from"
        hint="optional — today if you leave it"
      >
        <Input
          id="expectation_from"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </Field>
    </Ask>
  );
}

function ReserveForm() {
  const [name, setName] = useState("");
  const problem = name.trim().length < 2 ? "Give the reserve a name." : null;

  return (
    <Ask
      title="Start a reserve"
      summary="A named pot the home funds and spends from. It starts empty; contributions are what put money in it."
      draft={{ type: "create_reserve", payload: { name: name.trim() } }}
      disabled={problem}
    >
      <Field
        label="What is it for"
        htmlFor="reserve_name"
        hint="the name the home will see on every draw"
      >
        <Input
          id="reserve_name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Emergency fund"
        />
      </Field>
    </Ask>
  );
}

function DrawForm({
  context,
  currency,
}: {
  context: ProposalContext;
  currency: string;
}) {
  const [reserveId, setReserveId] = useState(context.reserves[0]?.id ?? "");
  const [expenseId, setExpenseId] = useState(context.drawableExpenses[0]?.id ?? "");
  const [note, setNote] = useState("");

  const reserve = context.reserves.find((item) => item.id === reserveId);
  const expense = context.drawableExpenses.find((item) => item.id === expenseId);

  // The same refusal the server makes, made here so the home is never asked to
  // approve something that cannot happen.
  const problem =
    !reserve || !expense
      ? "Pick a reserve and the expense it should pay for."
      : expense.amountPaise > reserve.balancePaise
        ? `${reserve.name} holds ${formatMoney(reserve.balancePaise, { currency })}, and this expense is ${formatMoney(expense.amountPaise, { currency })}.`
        : null;

  return (
    <Ask
      title="Draw from the reserve"
      summary="The expense stops being split between people and is paid by the pot instead. Its amount is the expense's own — a draw pays a specific cost."
      draft={{
        type: "reserve_draw",
        subject_type: "expense",
        subject_id: expenseId,
        payload: {
          reserve_id: reserveId,
          expense_id: expenseId,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }}
      disabled={problem}
    >
      <Field label="Which reserve" htmlFor="draw_reserve">
        <Select
          id="draw_reserve"
          value={reserveId}
          onChange={(event) => setReserveId(event.target.value)}
        >
          {context.reserves.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {formatMoney(item.balancePaise, { currency })}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Which expense" htmlFor="draw_expense">
        <Select
          id="draw_expense"
          value={expenseId}
          onChange={(event) => setExpenseId(event.target.value)}
        >
          {context.drawableExpenses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.description} — {formatMoney(item.amountPaise, { currency })}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Note" htmlFor="draw_note" hint="optional">
        <Input
          id="draw_note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
    </Ask>
  );
}

/** Rupees to paise, or null for anything that is not a number. */
function safePaise(rupees: string): number | null {
  if (!rupees.trim()) return null;
  try {
    return rupeesToPaise(rupees);
  } catch {
    return null;
  }
}
