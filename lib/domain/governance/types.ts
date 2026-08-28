/**
 * The governance vocabulary — docs/14-GOVERNANCE-SPEC.md.
 *
 * This module is framework- and database-free by design. Everything here is a
 * plain value, so the resolver and the participant selector can be tested over
 * randomised Homes without a Postgres anywhere near them.
 */

export type DecisionType =
  | "close_settlement"
  | "reopen_settlement"
  | "remove_member"
  | "change_rule"
  | "change_governance"
  | "change_home_mode"
  | "balance_adjustment"
  | "absence_request"
  | "join_request"
  | "expense_approval"
  | "chore_confirmation"
  | "set_expected_contribution"
  | "create_reserve"
  | "reserve_draw"
  // The fifteenth, added by migration 058 under D-60: the Home deciding how
  // many signatures a finished chore needs, or that it needs none.
  | "change_confirmation_policy";

export type DecisionLevel = "normal" | "important" | "critical";

export type DecisionStatus =
  | "waiting"
  | "approved"
  | "rejected"
  | "lapsed"
  | "cancelled"
  | "applied";

export type ResponseCapacity = "approver" | "acknowledger";
export type ResponseKind = "approve" | "reject" | "acknowledge";

export type MemberRole = "admin" | "co_admin" | "member";

/** The slice of a member the governance domain needs, and nothing else. */
export interface GovernanceMember {
  id: string;
  role: MemberRole | null;
  /** Only `active` people take part in anything. */
  status: "requested" | "active" | "inactive";
  /** A dependent is a head in the Home and not a voice in it. */
  kind: "adult" | "dependent";
}

/** `governance_policy`, as the domain sees it. */
export interface GovernancePolicy {
  criticalRequiresCoadmin: boolean;
  criticalMemberRule: "count" | "proportion";
  criticalMemberValue: number;
  governanceRequiresAll: boolean;
  absenceApproverRoles: MemberRole[];
  joinApproverRoles: MemberRole[];
  expenseApprovalsRequired: number;
  decisionDeadlineDays: number;
  absenceDeadlineHours: number;
}

export const DEFAULT_POLICY: GovernancePolicy = {
  criticalRequiresCoadmin: true,
  criticalMemberRule: "proportion",
  criticalMemberValue: 50,
  governanceRequiresAll: true,
  absenceApproverRoles: ["admin", "co_admin"],
  joinApproverRoles: ["admin", "co_admin"],
  expenseApprovalsRequired: 1,
  decisionDeadlineDays: 7,
  absenceDeadlineHours: 48,
};

export interface Participant {
  memberId: string;
  capacity: ResponseCapacity;
  /**
   * A mandatory participant gates the decision whatever the counts say: it
   * cannot approve until they have responded (spec 3.2).
   */
  isMandatory: boolean;
}

export interface DecisionResponse {
  memberId: string;
  capacity: ResponseCapacity;
  response: ResponseKind;
}

/** What the participant selector produces, and what the resolver consumes. */
export interface Requirement {
  level: DecisionLevel;
  participants: Participant[];
  requiredApprovals: number;
  requiredAcks: number;
  /** Null for `expense_approval`, which sits until answered. */
  deadlineHours: number | null;
  /**
   * A one-person Home has nobody to ask. The decision is recorded, and
   * approved on the spot, rather than pretending a quorum exists
   * (spec 3.3).
   */
  autoApprove: boolean;
}

/**
 * Why a proposal cannot be made at all.
 *
 * Refusing here rather than at apply time is deliberate: a Home should never be
 * asked to approve something that could not have taken effect.
 */
export type ProposalRefusal =
  | "SUBJECT_IS_PARTICIPANT"
  | "NOT_ENOUGH_PARTICIPANTS"
  | "NO_ACTIVE_MEMBERS";

export interface Proposal {
  type: DecisionType;
  proposerId: string;
  /** The member this decision is about, when it is about a member. */
  subjectMemberId?: string;
}
