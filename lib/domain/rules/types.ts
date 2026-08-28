/**
 * The rule vocabulary — docs/14-GOVERNANCE-SPEC.md section 6.
 *
 * Framework- and database-free, like `lib/domain/governance/`. Everything here
 * is a plain value so the parse validator and the version differ can be tested
 * over arbitrary input without a Postgres or a model anywhere near them.
 *
 * The three kind lists are the closed vocabulary the model is handed and the
 * form renders. They are deliberately short. Version 2.0 executes exactly two
 * of the combinations automatically; the rest are agreements the Home wrote
 * down and can point at, which is most of the value and is honest about what
 * the system can enforce.
 */

export const CONDITION_KINDS = [
  "chore_missed",
  "state_at_time",
  "time_of_day",
  "guest_present",
  "spend_exceeds",
  "other",
] as const;

export const ACTION_KINDS = [
  "task",
  "reschedule",
  "points_penalty",
  "money_penalty",
  "notify",
  "other",
] as const;

export const APPLIES_TO_KINDS = [
  "all",
  "role",
  "named_members",
  "room",
  "assignee",
  "responsible_person",
] as const;

export type ConditionKind = (typeof CONDITION_KINDS)[number];
export type ActionKind = (typeof ACTION_KINDS)[number];
export type AppliesToKind = (typeof APPLIES_TO_KINDS)[number];

export interface RuleCondition {
  kind: ConditionKind;
  /** `chore_missed` — the template it is about, when the Home named one. */
  template?: string;
  /** `state_at_time` — what should not be true, and when. */
  state?: string;
  at?: string;
  /** `time_of_day` — the boundary the rule hangs off. */
  after?: string;
  /** `spend_exceeds` — the ceiling, in paise, because all money is paise. */
  amountPaise?: number;
  /** Whatever the structured kinds could not carry, kept in words. */
  description?: string;
}

export interface RuleAction {
  kind: ActionKind;
  /** `task` — what somebody has to do. */
  text?: string;
  description?: string;
}

export interface RuleAppliesTo {
  kind: AppliesToKind;
  /** A role name, a room label, or a comma-free list of member ids. */
  value?: string;
  memberIds?: string[];
}

/**
 * A rule as the form holds it, before it is a row and before it is a decision.
 *
 * `originalText` is not derived from the other fields and is never regenerated
 * from them (RL-09). It is what the Home actually agreed to; everything else is
 * an interpretation of it that a person checked.
 */
export interface RuleProposal {
  title: string;
  originalText: string;
  condition: RuleCondition;
  action: RuleAction;
  appliesTo: RuleAppliesTo;
  weightPoints: number | null;
  penaltyPaise: number | null;
  startsOn: string | null;
  endsOn: string | null;
}

export const MIN_WEIGHT_POINTS = 1;
export const MAX_WEIGHT_POINTS = 100;
export const MIN_PENALTY_PAISE = 0;
/** ₹10,000. The same ceiling the check constraint in migration 066 applies. */
export const MAX_PENALTY_PAISE = 1_000_000;

export const MAX_TITLE_LENGTH = 60;
export const MAX_TEXT_LENGTH = 200;
export const MAX_ORIGINAL_TEXT_LENGTH = 1_000;

export type RuleStatus = "draft" | "proposed" | "active" | "disabled" | "superseded";
export type RuleParseSource = "manual" | "ai";

/**
 * What a `change_rule` decision was for.
 *
 * It rides in the decision payload rather than on the version row because it
 * describes the *question the Home was asked*, not a property of the version.
 * The version table cannot tell "activate this new rule" from "put this rule
 * back" — both are a pending version becoming the one in force — and the Home
 * can, so the answer is kept where the Home's answer is.
 */
export type RuleChangeAction = "create" | "edit" | "disable" | "enable";
