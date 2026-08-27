import type {
  DecisionResponse,
  DecisionStatus,
  Requirement,
} from "./types";

/**
 * The resolver — docs/14-GOVERNANCE-SPEC.md §3.2.
 *
 * Responses in, status out. No clock of its own, no database, no house: it
 * takes `now` and the deadline as arguments so that the same function answers
 * "what is this decision now" and "what would it have been at 4pm", and so
 * that a property test can run ten thousand Homes through it in a second.
 *
 * The thing to hold on to while reading it: **counting responders, not
 * responses.** A member listed in two capacities who answers in both has
 * spoken once. A resolver that counts rows lets one person clear a threshold
 * of two, which is precisely the property the version exists to protect.
 */

export interface ResolveInput {
  requirement: Requirement;
  responses: DecisionResponse[];
  now: Date;
  /** Null for a decision that sits until answered. */
  deadline: Date | null;
}

export function resolve(input: ResolveInput): DecisionStatus {
  const { requirement, responses, now, deadline } = input;

  if (requirement.autoApprove) return "approved";

  const participantById = new Map(
    requirement.participants.map((participant) => [participant.memberId, participant]),
  );

  // A response from somebody who is not a participant is not a response. The
  // database refuses to store one; the resolver refuses to count one, so that
  // neither is the only place the rule lives.
  const valid = responses.filter((response) => {
    const participant = participantById.get(response.memberId);
    return participant !== undefined && participant.capacity === response.capacity;
  });

  // One rejection ends it, whatever else has been collected. Checked before
  // the counts, because a decision that has both a rejection and enough
  // approvals is rejected — the veto is the point of the capacity.
  if (
    valid.some(
      (response) => response.capacity === "approver" && response.response === "reject",
    )
  ) {
    return "rejected";
  }

  const approvers = new Set(
    valid
      .filter(
        (response) =>
          response.capacity === "approver" && response.response === "approve",
      )
      .map((response) => response.memberId),
  );

  // An acknowledgement counts from either capacity: an approver who says "yes"
  // has plainly also accepted that it is happening. The reverse is not true,
  // which is why `acknowledger_cannot_reject` is a check constraint.
  const acknowledgers = new Set(
    valid
      .filter(
        (response) =>
          response.response === "acknowledge" || response.response === "approve",
      )
      .map((response) => response.memberId),
  );

  const responded = new Set(valid.map((response) => response.memberId));

  const everyMandatoryHasResponded = requirement.participants
    .filter((participant) => participant.isMandatory)
    .every((participant) => responded.has(participant.memberId));

  if (
    approvers.size >= requirement.requiredApprovals &&
    acknowledgers.size >= requirement.requiredAcks &&
    everyMandatoryHasResponded &&
    // The floor, restated here so that a requirement built by something other
    // than the selector cannot slip past it.
    (requirement.level !== "critical" || responded.size >= 2)
  ) {
    return "approved";
  }

  if (deadline && now > deadline) return "lapsed";

  return "waiting";
}

/** What the progress line on a decision card shows. */
export interface Progress {
  approvals: { given: number; required: number };
  acknowledgements: { given: number; required: number };
  outstandingMandatory: string[];
}

export function progressOf(input: Omit<ResolveInput, "now" | "deadline">): Progress {
  const { requirement, responses } = input;
  const participantById = new Map(
    requirement.participants.map((participant) => [participant.memberId, participant]),
  );
  const valid = responses.filter((response) => {
    const participant = participantById.get(response.memberId);
    return participant !== undefined && participant.capacity === response.capacity;
  });

  const approvers = new Set(
    valid
      .filter((r) => r.capacity === "approver" && r.response === "approve")
      .map((r) => r.memberId),
  );
  const acknowledgers = new Set(
    valid
      .filter((r) => r.response === "acknowledge" || r.response === "approve")
      .map((r) => r.memberId),
  );
  const responded = new Set(valid.map((r) => r.memberId));

  return {
    approvals: { given: approvers.size, required: requirement.requiredApprovals },
    acknowledgements: {
      given: acknowledgers.size,
      required: requirement.requiredAcks,
    },
    outstandingMandatory: requirement.participants
      .filter(
        (participant) => participant.isMandatory && !responded.has(participant.memberId),
      )
      .map((participant) => participant.memberId),
  };
}

/**
 * Would this caller's response complete the decision?
 *
 * Approve All needs the answer before it writes anything: a Critical decision
 * that would finish on the caller's tap is excluded from the batch and shown
 * on its own, with its full effect stated (AP-04).
 */
export function wouldComplete(
  input: Omit<ResolveInput, "now" | "deadline">,
  callerId: string,
): boolean {
  const participant = input.requirement.participants.find(
    (candidate) => candidate.memberId === callerId,
  );
  if (!participant) return false;

  const hypothetical: DecisionResponse = {
    memberId: callerId,
    capacity: participant.capacity,
    response: participant.capacity === "approver" ? "approve" : "acknowledge",
  };

  return (
    resolve({
      requirement: input.requirement,
      responses: [...input.responses, hypothetical],
      now: new Date(0),
      deadline: null,
    }) === "approved"
  );
}
