import { resolve, wouldComplete } from "./resolve";
import type { DecisionResponse, DecisionType, Requirement } from "./types";

/**
 * Approve All — docs/14-GOVERNANCE-SPEC.md §5.
 *
 * One control, several safety rules, and one of them is the reason this is a
 * pure function with a test rather than a `.filter()` in a route handler:
 *
 *   **Approve All never completes a Critical decision that is still waiting on
 *   somebody else.**
 *
 * Batching is for the things a person would have tapped through anyway. A
 * settlement close that finishes the moment they tap is not one of those, and
 * it is shown on its own with its full effect stated (AP-04).
 *
 * There is deliberately no Reject All. A rejection needs a reason, and a batch
 * of identical reasons is not a reason.
 */

export type SkipReason =
  | "ALREADY_RESPONDED"
  | "NOT_A_PARTICIPANT"
  | "CALLER_IS_SUBJECT_OR_PROPOSER"
  | "NOT_WAITING"
  | "CRITICAL_NEEDS_DELIBERATE_ACTION";

export interface BatchCandidate {
  id: string;
  type: DecisionType;
  kind: string;
  requirement: Requirement;
  responses: DecisionResponse[];
  requestedByMemberId: string;
  subjectMemberId: string | null;
  deadline: Date | null;
}

export interface BatchPlan {
  approve: { id: string; capacity: "approver" | "acknowledger" }[];
  skip: { id: string; kind: string; reason: SkipReason }[];
}

export function planApproveAll(
  candidates: BatchCandidate[],
  callerMemberId: string,
  now: Date,
): BatchPlan {
  const plan: BatchPlan = { approve: [], skip: [] };

  for (const candidate of candidates) {
    const skip = (reason: SkipReason) =>
      plan.skip.push({ id: candidate.id, kind: candidate.kind, reason });

    const participant = candidate.requirement.participants.find(
      (entry) => entry.memberId === callerMemberId,
    );
    if (!participant) {
      skip("NOT_A_PARTICIPANT");
      continue;
    }

    if (candidate.responses.some((response) => response.memberId === callerMemberId)) {
      skip("ALREADY_RESPONDED");
      continue;
    }

    if (
      callerMemberId === candidate.subjectMemberId ||
      callerMemberId === candidate.requestedByMemberId
    ) {
      skip("CALLER_IS_SUBJECT_OR_PROPOSER");
      continue;
    }

    const status = resolve({
      requirement: candidate.requirement,
      responses: candidate.responses,
      now,
      deadline: candidate.deadline,
    });
    if (status !== "waiting") {
      skip("NOT_WAITING");
      continue;
    }

    if (
      candidate.requirement.level === "critical" &&
      wouldComplete(
        { requirement: candidate.requirement, responses: candidate.responses },
        callerMemberId,
      )
    ) {
      skip("CRITICAL_NEEDS_DELIBERATE_ACTION");
      continue;
    }

    plan.approve.push({ id: candidate.id, capacity: participant.capacity });
  }

  return plan;
}

/** The count the Approvals surface shows as "Approve All would act on these". */
export function approvableNow(
  candidates: BatchCandidate[],
  callerMemberId: string,
  now: Date,
): number {
  return planApproveAll(candidates, callerMemberId, now).approve.length;
}
