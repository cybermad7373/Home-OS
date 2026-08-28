import type { GovernanceMember } from "./types";

/**
 * Chore confirmation quorum — docs/14-GOVERNANCE-SPEC.md §4.
 *
 * This replaces version 1.0's "any one peer confirms". It is a table rather
 * than a formula because the specification states it as a table, and because
 * the boundaries are product decisions rather than arithmetic: seven people is
 * where a second signature stops being ceremony.
 */

export type ConfirmationPolicy = "size_aware" | "single" | "off";

export interface Quorum {
  /** How many confirmations the assignment needs. */
  required: number;
  /** Whether one of them must come from an Admin or Co-Admin. */
  leadRequired: boolean;
  /** True when there is nobody to ask and the chore confirms on the spot. */
  autoConfirm: boolean;
}

/**
 * The count is snapshotted onto the assignment when it is marked done, not
 * read at confirmation time. Somebody joining the Home between "done" and
 * "confirmed" does not move the goalposts, and somebody leaving does not make
 * an already-satisfied chore un-confirmable.
 */
export function quorumFor(
  members: GovernanceMember[],
  assigneeMemberId: string,
  sharedWith: string[] = [],
  policy: ConfirmationPolicy = "size_aware",
): Quorum {
  const adults = members.filter(
    (member) => member.status === "active" && member.kind === "adult",
  );

  // A Family Home may reduce this to one acknowledgement or switch it off
  // entirely (CE-10). Nobody needs two signatures for a nine-year-old making
  // their bed.
  if (policy === "off") {
    return { required: 0, leadRequired: false, autoConfirm: true };
  }

  // Exclude ALL assignees (primary + shared_with) from the eligible pool
  const allAssignees = new Set([assigneeMemberId, ...sharedWith]);
  const others = adults.filter((member) => !allAssignees.has(member.id));

  // Nobody else in the Home. Auto-confirm rather than leave the chore stuck in
  // `done_pending` for ever.
  if (others.length === 0) {
    return { required: 0, leadRequired: false, autoConfirm: true };
  }

  if (policy === "single") {
    return { required: 1, leadRequired: false, autoConfirm: false };
  }

  const size = adults.length;

  if (size <= 3) {
    return { required: 1, leadRequired: false, autoConfirm: false };
  }

  const leadsAvailable = others.some(
    (member) => member.role === "admin" || member.role === "co_admin",
  );

  if (size <= 6) {
    return {
      required: Math.min(2, others.length),
      // A Home whose only lead is the person who did the chore cannot produce
      // a lead's signature. Asking for one anyway would make every chore wait
      // out the auto-confirm window, which is a slow way of switching the
      // feature off.
      leadRequired: leadsAvailable,
      autoConfirm: false,
    };
  }

  return {
    required: Math.min(3, others.length),
    leadRequired: leadsAvailable,
    autoConfirm: false,
  };
}

/** The slice of a marked-done chore the eligibility rules need. */
export interface ConfirmableAssignment {
  status: string;
  assigneeMemberId: string | null;
  assigneeKind: "adult" | "dependent";
  /** Set when the assignee is a dependent; the adult who marked it done. */
  assigneeGuardianMemberId: string | null;
  /** Other memberIds who share this assignment (CE-11). */
  sharedWith: string[];
  /** Who has already signed. */
  confirmedBy: string[];
}

/**
 * May this member still add a signature to this chore?
 *
 * The three bans the `chore_confirmation_is_peer` trigger enforces, stated
 * here so that no queue and no button offers somebody a confirmation the
 * database is going to refuse: not your own work, not your dependent's work
 * (D-24), not any shared assignee's work (CE-11), and not twice — the quorum
 * counts people, not signatures.
 *
 * This says nothing about whether the signature would *complete* the chore.
 * `quorumMet` answers that, and the database decides it.
 */
export function canConfirm(assignment: ConfirmableAssignment, memberId: string): boolean {
  if (assignment.status !== "done_pending") return false;
  // Exclude primary assignee and all shared assignees
  if (assignment.assigneeMemberId === memberId) return false;
  if (assignment.sharedWith?.includes(memberId)) return false;
  if (
    assignment.assigneeKind === "dependent" &&
    assignment.assigneeGuardianMemberId === memberId
  ) {
    return false;
  }
  return !assignment.confirmedBy.includes(memberId);
}

/**
 * Has a set of confirmations satisfied a snapshotted quorum?
 *
 * Auto-confirm still applies at every size (D-11): if the window passes with
 * the quorum unmet, the chore confirms with `auto_confirmed = true` and
 * `confirmed_by` null. Requiring an Admin's signature with no timeout would
 * hand every Admin a veto over everybody's points.
 */
export function quorumMet(
  quorum: Quorum,
  confirmations: { memberId: string; isLead: boolean }[],
): boolean {
  if (quorum.autoConfirm) return true;
  const distinct = new Map(confirmations.map((entry) => [entry.memberId, entry]));
  if (distinct.size < quorum.required) return false;
  if (quorum.leadRequired && ![...distinct.values()].some((entry) => entry.isLead)) {
    return false;
  }
  return true;
}
