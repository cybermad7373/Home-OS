import { COUNTING_CAPACITY, DECISION_LEVEL, deadlineHoursFor } from "./matrix";
import type {
  GovernanceMember,
  GovernancePolicy,
  Participant,
  Proposal,
  ProposalRefusal,
  Requirement,
} from "./types";

/**
 * Who is required, and in which capacity — docs/14-GOVERNANCE-SPEC.md §3.3.
 *
 * Every decision type is handled in this one file, deliberately (D-40). The
 * cases differ from each other in small ways that only make sense side by
 * side: which pool, who is excluded, whether the pool approves or
 * acknowledges. Split across fourteen modules, the differences look like
 * accidents rather than choices, and the first person to add a fifteenth type
 * copies whichever neighbour they happened to open.
 *
 * The shape of every case is the same:
 *
 *   pool      — who could be asked at all
 *   mandatory — who gates it regardless of the counts
 *   counting  — the rest of the pool, any `required` of whom will do
 */

export interface SelectionInput {
  proposal: Proposal;
  members: GovernanceMember[];
  policy: GovernancePolicy;
  /** The Home's auto-confirm window, which is the chore-confirmation deadline. */
  autoConfirmHours?: number;
}

export type Selection =
  | { requirement: Requirement }
  | { refusal: ProposalRefusal };

/**
 * The threshold the policy asks of a pool.
 *
 * `proportion` is a percentage and rounds up: half of five is three, because
 * "half the Home agreed" should not be satisfiable by two of five.
 */
export function thresholdFor(policy: GovernancePolicy, poolSize: number): number {
  if (poolSize === 0) return 0;
  const raw =
    policy.criticalMemberRule === "count"
      ? policy.criticalMemberValue
      : Math.ceil((poolSize * policy.criticalMemberValue) / 100);
  return Math.max(1, Math.min(poolSize, raw));
}

function activeAdults(members: GovernanceMember[]): GovernanceMember[] {
  return members.filter(
    (member) => member.status === "active" && member.kind === "adult",
  );
}

function isLead(member: GovernanceMember): boolean {
  return member.role === "admin" || member.role === "co_admin";
}

/**
 * The floor the whole version exists to hold: a Critical decision needs two
 * distinct people to have responded, in a Home that has two people to ask.
 *
 * It is applied here rather than in the resolver because a requirement that
 * cannot be met should never become a decision. A Home asked to approve
 * something that will lapse whatever it does learns to ignore the queue.
 */
const CRITICAL_MINIMUM_RESPONDERS = 2;

export function selectParticipants(input: SelectionInput): Selection {
  const { proposal, members, policy } = input;
  const type = proposal.type;
  const level = DECISION_LEVEL[type];
  const capacity = COUNTING_CAPACITY[type];
  const adults = activeAdults(members);

  if (adults.length === 0) return { refusal: "NO_ACTIVE_MEMBERS" };

  // -------------------------------------------------------------------------
  // The pool, one case per type
  // -------------------------------------------------------------------------
  let pool: GovernanceMember[];

  switch (type) {
    case "absence_request":
    case "join_request":
      // Only the people the policy names as approvers, and never the person
      // asking — a leave request is not self-service.
      pool = adults.filter(
        (member) =>
          member.role !== null &&
          (type === "absence_request"
            ? policy.absenceApproverRoles
            : policy.joinApproverRoles
          ).includes(member.role) &&
          member.id !== proposal.proposerId,
      );
      break;

    case "expense_approval":
      // Everybody except the payer (BR: no self-approval), and the subject of
      // an expense decision is its payer.
      pool = adults.filter((member) => member.id !== proposal.subjectMemberId);
      break;

    case "chore_confirmation":
      // Everybody except the assignee. The size-aware quorum itself lives in
      // `quorum.ts`, because it is a table rather than a threshold.
      pool = adults.filter((member) => member.id !== proposal.subjectMemberId);
      break;

    case "balance_adjustment":
      // Only the two people whose money moves, and both of them.
      pool = adults.filter((member) => member.id !== proposal.proposerId);
      break;

    default:
      // Every Critical type: the whole Home, minus whoever it is about.
      pool = adults.filter((member) => member.id !== proposal.subjectMemberId);
      break;
  }

  // The subject is never a required participant in their own decision, and it
  // is worth saying so explicitly rather than relying on each case above to
  // have remembered (spec 3.3, enforced again by a trigger in the database).
  if (
    proposal.subjectMemberId &&
    pool.some((member) => member.id === proposal.subjectMemberId)
  ) {
    return { refusal: "SUBJECT_IS_PARTICIPANT" };
  }

  if (pool.length === 0) return { refusal: "NOT_ENOUGH_PARTICIPANTS" };

  // -------------------------------------------------------------------------
  // The one-person Home
  // -------------------------------------------------------------------------
  // Nobody to ask. The decision is recorded and approved on the spot, which is
  // honest, rather than manufacturing a quorum of one and calling it consent.
  if (adults.length === 1) {
    return {
      requirement: {
        level,
        participants: [],
        requiredApprovals: 0,
        requiredAcks: 0,
        deadlineHours: deadlineHoursFor(type, policy, input.autoConfirmHours ?? 48),
        autoApprove: true,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Mandatory, counting, and the numbers
  // -------------------------------------------------------------------------
  const mandatory: Participant[] = [];
  const proposer = pool.find((member) => member.id === proposal.proposerId);

  if (level === "critical") {
    // The proposer's proposal is their approval; they are listed so that the
    // decision names everyone it depends on, and a response row is written for
    // them at proposal time.
    if (proposer) {
      mandatory.push({
        memberId: proposer.id,
        capacity: "approver",
        isMandatory: true,
      });
    }

    // Section 7's flow: the Admin proposes, the Co-Admin acknowledges, and the
    // member requirement is collected after. A Home with no Co-Admin drops the
    // slot; the floor below is what keeps the property true when it does.
    if (policy.criticalRequiresCoadmin) {
      for (const member of pool) {
        if (member.role === "co_admin" && member.id !== proposal.proposerId) {
          mandatory.push({
            memberId: member.id,
            capacity: "acknowledger",
            isMandatory: true,
          });
        }
      }
    }
  }

  const mandatoryIds = new Set(mandatory.map((entry) => entry.memberId));
  const counting: Participant[] = pool
    .filter((member) => !mandatoryIds.has(member.id))
    .map((member) => ({ memberId: member.id, capacity, isMandatory: false }));

  const participants = [...mandatory, ...counting];

  // How many of each kind the pool must produce.
  let requiredApprovals: number;
  let requiredAcks: number;

  switch (type) {
    case "balance_adjustment":
      // Both of the affected members, by name.
      requiredApprovals = participants.filter((p) => p.capacity === "approver").length;
      requiredAcks = participants.filter((p) => p.capacity === "acknowledger").length;
      break;

    case "change_governance":
      // A governance policy one person can quietly loosen is not a governance
      // policy (GV-12).
      requiredApprovals = participants.filter((p) => p.capacity === "approver").length;
      requiredAcks = policy.governanceRequiresAll
        ? participants.filter((p) => p.capacity === "acknowledger").length
        : thresholdFor(policy, pool.length);
      break;

    case "absence_request":
    case "join_request":
      requiredApprovals = 1;
      requiredAcks = 0;
      break;

    case "expense_approval":
      requiredApprovals = Math.min(pool.length, policy.expenseApprovalsRequired);
      requiredAcks = 0;
      break;

    case "chore_confirmation":
      // Set by the quorum table at "done" time and passed in as the required
      // approvals; the selector only names who may confirm.
      requiredApprovals = 1;
      requiredAcks = 0;
      break;

    default: {
      const threshold = thresholdFor(policy, pool.length);
      const mandatoryApprovals = mandatory.filter(
        (p) => p.capacity === "approver",
      ).length;
      const mandatoryAcks = mandatory.filter(
        (p) => p.capacity === "acknowledger",
      ).length;

      if (capacity === "approver") {
        requiredApprovals = Math.max(threshold, mandatoryApprovals);
        requiredAcks = mandatoryAcks;
      } else {
        requiredApprovals = mandatoryApprovals;
        requiredAcks = Math.max(threshold, mandatoryAcks);
      }
      break;
    }
  }

  // -------------------------------------------------------------------------
  // The floor
  // -------------------------------------------------------------------------
  if (level === "critical") {
    const distinctResponders = new Set(participants.map((p) => p.memberId)).size;

    if (distinctResponders < CRITICAL_MINIMUM_RESPONDERS) {
      // Two people, and the decision is about one of them: there is genuinely
      // nobody left to ask. Refusing at proposal time is the only answer that
      // keeps the property true and the queue honest.
      return { refusal: "NOT_ENOUGH_PARTICIPANTS" };
    }

    // Raise whichever count is short, so that no single member's responses can
    // satisfy both numbers at once.
    if (requiredApprovals + requiredAcks < CRITICAL_MINIMUM_RESPONDERS) {
      if (capacity === "approver") {
        requiredApprovals = Math.min(
          participants.filter((p) => p.capacity === "approver").length,
          CRITICAL_MINIMUM_RESPONDERS - requiredAcks,
        );
      } else {
        requiredAcks = Math.min(
          participants.filter((p) => p.capacity === "acknowledger").length,
          CRITICAL_MINIMUM_RESPONDERS - requiredApprovals,
        );
      }
    }
  }

  return {
    requirement: {
      level,
      participants,
      requiredApprovals,
      requiredAcks,
      deadlineHours: deadlineHoursFor(type, policy, input.autoConfirmHours ?? 48),
      autoApprove: false,
    },
  };
}

export { isLead, activeAdults };
