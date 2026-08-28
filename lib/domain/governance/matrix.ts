import type { DecisionLevel, DecisionType } from "./types";

/**
 * The default level matrix — docs/14-GOVERNANCE-SPEC.md section 1, and the
 * deadlines from section 3.4.
 *
 * It is a table rather than a switch because the whole point of the levels is
 * that a person can read the classification in one place and disagree with it.
 * A rule spread across fourteen call sites is a rule nobody audits.
 */

export const DECISION_LEVEL: Record<DecisionType, DecisionLevel> = {
  // Level 3 — the rare, consequential, argument-causing actions.
  close_settlement: "critical",
  reopen_settlement: "critical",
  remove_member: "critical",
  change_rule: "critical",
  change_governance: "critical",
  change_home_mode: "critical",
  balance_adjustment: "critical",
  change_confirmation_policy: "critical",
  set_expected_contribution: "critical",
  create_reserve: "critical",
  reserve_draw: "critical",

  // Level 2 — somebody with authority acts, and the Home is told.
  absence_request: "important",
  join_request: "important",

  // Level 1 in everything but name: these have always needed one other
  // person, and they run through the same engine so that "approved" means one
  // thing in this codebase rather than eight.
  expense_approval: "normal",
  chore_confirmation: "normal",
};

export const CRITICAL_TYPES = (
  Object.keys(DECISION_LEVEL) as DecisionType[]
).filter((type) => DECISION_LEVEL[type] === "critical");

/**
 * Whether the counting pool is asked to agree or merely to accept.
 *
 * Section 2: approval can stop the action, acknowledgement can only delay it.
 * Getting this wrong in either direction is the most common failure the
 * specification names — unanimous approval for everything is unusable, and
 * acknowledgement where approval belongs is a veto quietly removed.
 */
export const COUNTING_CAPACITY: Record<DecisionType, "approver" | "acknowledger"> = {
  close_settlement: "acknowledger", // the Home has no grounds to refuse arithmetic
  reopen_settlement: "approver",
  remove_member: "approver",
  change_rule: "acknowledger",
  change_governance: "acknowledger",
  change_home_mode: "acknowledger",
  // The Home is told rather than asked, like every other settings change: a
  // confirmation policy one member can veto is one member's policy.
  change_confirmation_policy: "acknowledger",
  balance_adjustment: "approver",
  set_expected_contribution: "acknowledger",
  create_reserve: "approver",
  reserve_draw: "approver",
  absence_request: "approver",
  join_request: "approver",
  expense_approval: "approver",
  chore_confirmation: "approver",
};

/**
 * Deadlines, in hours. Null means "sits until answered", which is right for an
 * expense: an unapproved expense already blocks the close, so a lapse would
 * only convert one blockage into another.
 */
export function deadlineHoursFor(
  type: DecisionType,
  policy: { decisionDeadlineDays: number; absenceDeadlineHours: number },
  autoConfirmHours: number,
): number | null {
  switch (type) {
    case "absence_request":
    case "join_request":
      return policy.absenceDeadlineHours;
    case "chore_confirmation":
      return autoConfirmHours;
    case "expense_approval":
      return null;
    default:
      return policy.decisionDeadlineDays * 24;
  }
}
