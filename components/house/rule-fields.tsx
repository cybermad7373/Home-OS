"use client";

import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import {
  ACTION_KINDS,
  APPLIES_TO_KINDS,
  CONDITION_KINDS,
  MAX_PENALTY_PAISE,
  MAX_WEIGHT_POINTS,
  MIN_WEIGHT_POINTS,
  type ActionKind,
  type AppliesToKind,
  type ConditionKind,
} from "@/lib/domain/rules/types";
import {
  RULE_ACTION_LABEL,
  RULE_APPLIES_TO_LABEL,
  RULE_CONDITION_LABEL,
} from "@/lib/types/domain";

/**
 * `RuleFields` — the structured half of S-41.
 *
 * Always visible and always editable, whether a parse ran or not. That is the
 * whole of RL-08: a Home with no AI writes the same rule through these fields,
 * and the module is complete. A parse is a head start, never a wall — so
 * nothing here is disabled, greyed, or gated on a model having answered.
 */

export interface RuleDraft {
  title: string;
  originalText: string;
  conditionKind: ConditionKind;
  conditionDetail: string;
  actionKind: ActionKind;
  actionText: string;
  appliesToKind: AppliesToKind;
  appliesToValue: string;
  /** Both are strings because they are what an input holds. Parsed on submit. */
  weightPoints: string;
  penaltyRupees: string;
  startsOn: string;
  endsOn: string;
}

export function emptyDraft(): RuleDraft {
  return {
    title: "",
    originalText: "",
    conditionKind: "other",
    conditionDetail: "",
    actionKind: "other",
    actionText: "",
    appliesToKind: "all",
    appliesToValue: "",
    weightPoints: "",
    penaltyRupees: "",
    startsOn: "",
    endsOn: "",
  };
}

/** What the detail field beside "When" is asking for, per condition kind. */
const CONDITION_DETAIL: Partial<Record<ConditionKind, { label: string; hint: string }>> = {
  chore_missed: { label: "Which chore", hint: "leave blank for any" },
  state_at_time: { label: "What, and when", hint: "unwashed vessels, end of day" },
  time_of_day: { label: "After what time", hint: "23:00, or dinner" },
  spend_exceeds: { label: "Over how much", hint: "in rupees" },
  other: { label: "When, in your words", hint: "" },
};

const APPLIES_TO_DETAIL: Partial<Record<AppliesToKind, { label: string; hint: string }>> = {
  role: { label: "Which role", hint: "admin, co_admin or member" },
  room: { label: "Which room", hint: "the room's label" },
  named_members: { label: "Who", hint: "pick them after this goes live" },
};

export function RuleFields({
  draft,
  onChange,
  /** Chore template names, so "which chore" is a list rather than a spelling test. */
  templates,
}: {
  draft: RuleDraft;
  onChange: (next: RuleDraft) => void;
  templates: string[];
}) {
  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const conditionDetail = CONDITION_DETAIL[draft.conditionKind];
  const appliesToDetail = APPLIES_TO_DETAIL[draft.appliesToKind];

  return (
    <>
      <Field label="Name" htmlFor="rule-title" hint="short, and how the list will show it">
        <Input
          id="rule-title"
          value={draft.title}
          maxLength={60}
          placeholder="Clean dishes after eating"
          onChange={(event) => set("title", event.target.value)}
        />
      </Field>

      <Field label="When" htmlFor="rule-condition">
        <Select
          id="rule-condition"
          value={draft.conditionKind}
          onChange={(event) => set("conditionKind", event.target.value as ConditionKind)}
        >
          {CONDITION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {RULE_CONDITION_LABEL[kind]}
            </option>
          ))}
        </Select>
      </Field>

      {conditionDetail ? (
        <Field
          label={conditionDetail.label}
          htmlFor="rule-condition-detail"
          hint={conditionDetail.hint || undefined}
        >
          {draft.conditionKind === "chore_missed" && templates.length > 0 ? (
            <Select
              id="rule-condition-detail"
              value={draft.conditionDetail}
              onChange={(event) => set("conditionDetail", event.target.value)}
            >
              <option value="">Any chore</option>
              {templates.map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="rule-condition-detail"
              value={draft.conditionDetail}
              maxLength={200}
              onChange={(event) => set("conditionDetail", event.target.value)}
            />
          )}
        </Field>
      ) : null}

      <Field label="Then" htmlFor="rule-action">
        <Select
          id="rule-action"
          value={draft.actionKind}
          onChange={(event) => set("actionKind", event.target.value as ActionKind)}
        >
          {ACTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {RULE_ACTION_LABEL[kind]}
            </option>
          ))}
        </Select>
      </Field>

      {draft.actionKind !== "reschedule" && draft.actionKind !== "notify" ? (
        <Field label="What happens" htmlFor="rule-action-text">
          <Input
            id="rule-action-text"
            value={draft.actionText}
            maxLength={200}
            placeholder="Clean own dishes"
            onChange={(event) => set("actionText", event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Applies to" htmlFor="rule-applies-to">
        <Select
          id="rule-applies-to"
          value={draft.appliesToKind}
          onChange={(event) => set("appliesToKind", event.target.value as AppliesToKind)}
        >
          {APPLIES_TO_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {RULE_APPLIES_TO_LABEL[kind]}
            </option>
          ))}
        </Select>
      </Field>

      {appliesToDetail ? (
        <Field
          label={appliesToDetail.label}
          htmlFor="rule-applies-to-value"
          hint={appliesToDetail.hint || undefined}
        >
          <Input
            id="rule-applies-to-value"
            value={draft.appliesToValue}
            maxLength={200}
            onChange={(event) => set("appliesToValue", event.target.value)}
          />
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Points"
          htmlFor="rule-weight"
          hint="optional"
        >
          <Input
            id="rule-weight"
            type="number"
            inputMode="numeric"
            min={MIN_WEIGHT_POINTS}
            max={MAX_WEIGHT_POINTS}
            value={draft.weightPoints}
            onChange={(event) => set("weightPoints", event.target.value)}
          />
        </Field>

        <Field label="Penalty ₹" htmlFor="rule-penalty" hint="optional">
          <Input
            id="rule-penalty"
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_PENALTY_PAISE / 100}
            step="0.01"
            value={draft.penaltyRupees}
            onChange={(event) => set("penaltyRupees", event.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="rule-starts" hint="optional">
          <Input
            id="rule-starts"
            type="date"
            value={draft.startsOn}
            onChange={(event) => set("startsOn", event.target.value)}
          />
        </Field>

        <Field label="Until" htmlFor="rule-ends" hint="optional">
          <Input
            id="rule-ends"
            type="date"
            value={draft.endsOn}
            onChange={(event) => set("endsOn", event.target.value)}
          />
        </Field>
      </div>
    </>
  );
}

/** Rupees in the field, paise on the wire. Money is integer paise everywhere else. */
export function paiseFrom(rupees: string): number | null {
  const trimmed = rupees.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function intFrom(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}
