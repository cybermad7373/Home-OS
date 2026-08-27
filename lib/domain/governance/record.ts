import { planApproveAll, type BatchCandidate, type BatchPlan } from "./approvals";
import { progressOf, resolve, wouldComplete, type Progress } from "./resolve";
import type {
  DecisionLevel,
  DecisionResponse,
  DecisionStatus,
  DecisionType,
  Participant,
  Requirement,
  ResponseCapacity,
  ResponseKind,
} from "./types";

/**
 * A stored decision, as the domain sees it — docs/14-GOVERNANCE-SPEC.md §3.
 *
 * The engine in this directory was written before there was a table to read
 * from: `selectParticipants` produces a `Requirement`, and `resolve` consumes
 * one. A decision that has been written down and read back is the same
 * requirement with an id attached, and this module is the translation, kept
 * here rather than in `lib/data/governance.ts` so that it stays a pure
 * function of plain values and can be tested without a Postgres.
 *
 * Nothing here reads a Supabase row type on purpose. The repository maps
 * columns to these fields; if a column is renamed, one file changes.
 */

export interface DecisionRecord {
  id: string;
  type: DecisionType;
  level: DecisionLevel;
  status: DecisionStatus;
  requestedByMemberId: string;
  subjectMemberId: string | null;
  requiredApprovals: number;
  requiredAcks: number;
  autoApproved: boolean;
  deadline: Date | null;
}

/**
 * The requirement the decision was proposed under.
 *
 * Note what it does *not* do: it never re-runs the selector. The participants
 * and the counts are whatever was recorded at proposal time, so a member
 * joining or leaving afterwards cannot move the goalposts of a decision that
 * is already being answered — the same rule the chore quorum states in §4, and
 * for the same reason.
 */
export function requirementFrom(
  record: DecisionRecord,
  participants: Participant[],
): Requirement {
  return {
    level: record.level,
    participants,
    requiredApprovals: record.requiredApprovals,
    requiredAcks: record.requiredAcks,
    // The stored deadline is an instant; the hours it was derived from are not
    // kept, and nothing downstream of a proposal needs them.
    deadlineHours: null,
    autoApprove: record.autoApproved,
  };
}

export function candidateFrom(
  record: DecisionRecord,
  participants: Participant[],
  responses: DecisionResponse[],
): BatchCandidate {
  return {
    id: record.id,
    type: record.type,
    kind: record.type,
    requirement: requirementFrom(record, participants),
    responses,
    requestedByMemberId: record.requestedByMemberId,
    subjectMemberId: record.subjectMemberId,
    deadline: record.deadline,
  };
}

export function planBatch(
  candidates: BatchCandidate[],
  callerMemberId: string,
  now: Date,
): BatchPlan {
  return planApproveAll(candidates, callerMemberId, now);
}

/** Why this caller may not answer this decision right now. */
export type ResponseRefusal =
  | "NOT_A_PARTICIPANT"
  | "ALREADY_RESPONDED"
  | "ALREADY_RESOLVED";

export type ResponseCheck =
  | { capacity: ResponseCapacity; wouldComplete: boolean }
  | { refusal: ResponseRefusal };

/**
 * Whether the caller may answer, and in which capacity.
 *
 * The database says all of this too — the `respond_to_own_decision` insert
 * policy is exactly these three clauses — and that is the copy that holds when
 * the caller is not this application. This one exists so that a person who
 * cannot answer is told which of the three reasons applies, rather than
 * receiving a row-level-security refusal with nothing in it.
 *
 * `wouldComplete` is carried back because a Critical decision that finishes on
 * this response is shown with its full effect stated before it is sent (AP-04).
 */
export function checkResponse(
  record: DecisionRecord,
  participants: Participant[],
  responses: DecisionResponse[],
  callerMemberId: string,
  requested?: ResponseCapacity,
): ResponseCheck {
  if (record.status !== "waiting") return { refusal: "ALREADY_RESOLVED" };

  const mine = participants.filter(
    (participant) => participant.memberId === callerMemberId,
  );
  if (mine.length === 0) return { refusal: "NOT_A_PARTICIPANT" };

  // A person may legitimately be listed twice — an approver on the count and
  // an acknowledger by role. Answering in one capacity does not spend the
  // other, but the resolver still counts them once.
  const answered = new Set(
    responses
      .filter((response) => response.memberId === callerMemberId)
      .map((response) => response.capacity),
  );

  const capacity =
    requested ??
    mine.find((participant) => !answered.has(participant.capacity))?.capacity;

  if (!capacity) return { refusal: "ALREADY_RESPONDED" };
  if (!mine.some((participant) => participant.capacity === capacity)) {
    return { refusal: "NOT_A_PARTICIPANT" };
  }
  if (answered.has(capacity)) return { refusal: "ALREADY_RESPONDED" };

  return {
    capacity,
    wouldComplete: wouldComplete(
      { requirement: requirementFrom(record, participants), responses },
      callerMemberId,
    ),
  };
}

/** What a response of this kind, from this member, would leave the decision as. */
export function statusAfter(
  record: DecisionRecord,
  participants: Participant[],
  responses: DecisionResponse[],
  response: DecisionResponse,
  now: Date,
): DecisionStatus {
  return resolve({
    requirement: requirementFrom(record, participants),
    responses: [...responses, response],
    now,
    deadline: record.deadline,
  });
}

export function progressFor(
  record: DecisionRecord,
  participants: Participant[],
  responses: DecisionResponse[],
): Progress {
  return progressOf({
    requirement: requirementFrom(record, participants),
    responses,
  });
}

/**
 * The response an ordinary tap sends, given the capacity the caller holds.
 *
 * An acknowledger accepts that something is happening; they were never asked
 * whether it should (spec §2). Offering them "approve" would be offering them
 * a veto the check constraint would refuse anyway.
 */
export function affirmativeFor(capacity: ResponseCapacity): ResponseKind {
  return capacity === "approver" ? "approve" : "acknowledge";
}
