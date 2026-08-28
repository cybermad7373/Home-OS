import type { RuleProposal } from "./types";

/**
 * What changed between two versions of a rule — RL-07.
 *
 * The history screen has to answer, for every version: who changed it, when,
 * **the old value and the new value, field by field**, the reason given, and
 * who acknowledged it. Four of those six come off the row. This module is the
 * fifth, and it is here rather than in the component because "did the penalty
 * change" is a question with a right answer that a test can ask.
 *
 * Pure, and it never reads the database. A version snapshot in, a list of
 * changes out.
 */

export interface RuleFieldChange {
  /** The column, for a test and for a key. */
  field: RuleField;
  /** The column in the words the screen uses. */
  label: string;
  before: string | null;
  after: string | null;
}

export type RuleField =
  | "title"
  | "original_text"
  | "condition"
  | "action"
  | "applies_to"
  | "weight_points"
  | "penalty_paise"
  | "starts_on"
  | "ends_on";

/** The snapshot the differ compares. A version row, in domain spelling. */
export interface RuleSnapshot extends RuleProposal {
  versionNo: number;
}

const LABELS: Record<RuleField, string> = {
  title: "Name",
  original_text: "What it says",
  condition: "When",
  action: "Then",
  applies_to: "Applies to",
  weight_points: "Points",
  penalty_paise: "Penalty",
  starts_on: "From",
  ends_on: "Until",
};

/**
 * The changes from `before` to `after`, in the order the form shows the fields.
 *
 * A first version has no `before`, and the answer there is an empty list rather
 * than nine changes from nothing: version 1 is not a change to a rule, it is
 * the rule. The screen says "created" over it and shows the values themselves.
 */
export function diffVersions(
  before: RuleSnapshot | null,
  after: RuleSnapshot,
): RuleFieldChange[] {
  if (!before) return [];

  const changes: RuleFieldChange[] = [];
  const add = (field: RuleField, from: string | null, to: string | null) => {
    if (from !== to) changes.push({ field, label: LABELS[field], before: from, after: to });
  };

  add("title", before.title, after.title);
  add("original_text", before.originalText, after.originalText);
  add("condition", describeCondition(before), describeCondition(after));
  add("action", describeAction(before), describeAction(after));
  add("applies_to", describeAppliesTo(before), describeAppliesTo(after));
  add("weight_points", points(before.weightPoints), points(after.weightPoints));
  add("penalty_paise", rupees(before.penaltyPaise), rupees(after.penaltyPaise));
  add("starts_on", before.startsOn, after.startsOn);
  add("ends_on", before.endsOn, after.endsOn);

  return changes;
}

/**
 * The structured halves rendered as one line each.
 *
 * A jsonb-versus-jsonb diff would be honest and unreadable — `{"kind":"task"}`
 * against `{"kind":"task","text":"…"}` tells somebody nothing about what the
 * Home agreed to differently. These are the same sentences the rule row shows,
 * so the history reads in the vocabulary the rest of the screen uses.
 */
export function describeCondition(rule: RuleProposal): string {
  const c = rule.condition;
  switch (c.kind) {
    case "chore_missed":
      return c.template ? `${c.template} is missed` : "A chore is missed";
    case "state_at_time":
      return [c.state, c.at].filter(Boolean).join(" at ") || "A state at a time";
    case "time_of_day":
      return c.after ? `After ${c.after}` : "At a time of day";
    case "guest_present":
      return "A guest is staying";
    case "spend_exceeds":
      return c.amountPaise !== undefined
        ? `Spending goes over ${rupees(c.amountPaise)}`
        : "Spending goes over a limit";
    case "other":
      return c.description ?? "Always";
  }
}

export function describeAction(rule: RuleProposal): string {
  const a = rule.action;
  switch (a.kind) {
    case "task":
      return a.text ?? "Do the task";
    case "reschedule":
      return "The missed job is rescheduled";
    case "points_penalty":
      return rule.weightPoints !== null
        ? `${rule.weightPoints} points off`
        : "Points come off";
    case "money_penalty":
      return rule.penaltyPaise !== null
        ? `${rupees(rule.penaltyPaise)} penalty`
        : "A money penalty";
    case "notify":
      return "The house is told";
    case "other":
      return a.description ?? a.text ?? "As written above";
  }
}

export function describeAppliesTo(rule: RuleProposal): string {
  const t = rule.appliesTo;
  switch (t.kind) {
    case "all":
      return "Everyone";
    case "role":
      return t.value ? `Anyone who is ${t.value}` : "A role";
    case "named_members":
      return t.memberIds?.length
        ? `${t.memberIds.length} named ${t.memberIds.length === 1 ? "person" : "people"}`
        : "Named people";
    case "room":
      return t.value ? `Room ${t.value}` : "A room";
    case "assignee":
      return "Whoever it was assigned to";
    case "responsible_person":
      return "Whoever was responsible";
  }
}

/** Paise to rupees, at the UI boundary and nowhere earlier. */
export function rupees(paise: number | null): string | null {
  if (paise === null) return null;
  const whole = Math.trunc(paise / 100);
  const part = Math.abs(paise % 100);
  return part === 0
    ? `₹${whole.toLocaleString("en-IN")}`
    : `₹${whole.toLocaleString("en-IN")}.${String(part).padStart(2, "0")}`;
}

function points(value: number | null): string | null {
  if (value === null) return null;
  return value === 1 ? "1 point" : `${value} points`;
}
