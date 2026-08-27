import { describe, expect, it } from "vitest";
import {
  affirmativeFor,
  candidateFrom,
  checkResponse,
  planBatch,
  progressFor,
  requirementFrom,
  statusAfter,
  type DecisionRecord,
} from "@/lib/domain/governance/record";
import type { DecisionResponse, Participant } from "@/lib/domain/governance/types";

/**
 * A decision written down and read back — docs/14-GOVERNANCE-SPEC.md §3.
 *
 * `lib/data/governance.ts` maps Supabase rows onto these values and does
 * nothing else with them, so everything worth asserting about a stored
 * decision is assertable here, with no Postgres and no Supabase client.
 */

const NOW = new Date("2026-08-27T12:00:00Z");

function decision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "d1",
    type: "remove_member",
    level: "critical",
    status: "waiting",
    requestedByMemberId: "ravi",
    subjectMemberId: "sam",
    requiredApprovals: 2,
    requiredAcks: 1,
    autoApproved: false,
    deadline: new Date("2026-09-03T12:00:00Z"),
    ...overrides,
  };
}

const PARTICIPANTS: Participant[] = [
  { memberId: "ravi", capacity: "approver", isMandatory: true },
  { memberId: "priya", capacity: "acknowledger", isMandatory: true },
  { memberId: "arun", capacity: "approver", isMandatory: false },
];

const RAVI_APPROVED: DecisionResponse[] = [
  { memberId: "ravi", capacity: "approver", response: "approve" },
];

describe("requirementFrom", () => {
  it("takes the counts as recorded, not as they would be recomputed today", () => {
    const requirement = requirementFrom(
      decision({ requiredApprovals: 2, requiredAcks: 1 }),
      PARTICIPANTS,
    );

    expect(requirement.requiredApprovals).toBe(2);
    expect(requirement.requiredAcks).toBe(1);
    expect(requirement.participants).toHaveLength(3);
    expect(requirement.autoApprove).toBe(false);
  });

  it("carries the one-person Home's auto-approval through", () => {
    const requirement = requirementFrom(
      decision({ autoApproved: true, status: "approved" }),
      [],
    );
    expect(requirement.autoApprove).toBe(true);
  });
});

describe("checkResponse", () => {
  it("names the capacity the caller was asked in", () => {
    const check = checkResponse(decision(), PARTICIPANTS, [], "priya");
    expect(check).toEqual({ capacity: "acknowledger", wouldComplete: false });
  });

  it("refuses somebody who was not asked", () => {
    expect(checkResponse(decision(), PARTICIPANTS, [], "meera")).toEqual({
      refusal: "NOT_A_PARTICIPANT",
    });
  });

  it("refuses the subject of the decision, who is never a participant", () => {
    expect(checkResponse(decision(), PARTICIPANTS, [], "sam")).toEqual({
      refusal: "NOT_A_PARTICIPANT",
    });
  });

  it("refuses a second response in the same capacity", () => {
    expect(checkResponse(decision(), PARTICIPANTS, RAVI_APPROVED, "ravi")).toEqual({
      refusal: "ALREADY_RESPONDED",
    });
  });

  it("refuses a response to a decision that has already resolved", () => {
    expect(
      checkResponse(decision({ status: "approved" }), PARTICIPANTS, [], "arun"),
    ).toEqual({ refusal: "ALREADY_RESOLVED" });
  });

  it("lets a member listed in both capacities answer in the second one", () => {
    const both: Participant[] = [
      { memberId: "ravi", capacity: "approver", isMandatory: true },
      { memberId: "ravi", capacity: "acknowledger", isMandatory: false },
      { memberId: "arun", capacity: "approver", isMandatory: false },
    ];

    const check = checkResponse(decision(), both, RAVI_APPROVED, "ravi");
    expect(check).toEqual({ capacity: "acknowledger", wouldComplete: false });
  });

  it("refuses a capacity the caller was not asked in, even when they hold another", () => {
    expect(
      checkResponse(decision(), PARTICIPANTS, [], "priya", "approver"),
    ).toEqual({ refusal: "NOT_A_PARTICIPANT" });
  });

  it("flags the response that would complete the decision", () => {
    // Ravi and Priya have answered; Arun's approval is the second of two and
    // the last mandatory response is already in.
    const responses: DecisionResponse[] = [
      ...RAVI_APPROVED,
      { memberId: "priya", capacity: "acknowledger", response: "acknowledge" },
    ];

    const check = checkResponse(decision(), PARTICIPANTS, responses, "arun");
    expect(check).toEqual({ capacity: "approver", wouldComplete: true });
  });
});

describe("statusAfter", () => {
  it("stays waiting while a mandatory acknowledgement is outstanding", () => {
    const status = statusAfter(
      decision(),
      PARTICIPANTS,
      RAVI_APPROVED,
      { memberId: "arun", capacity: "approver", response: "approve" },
      NOW,
    );
    expect(status).toBe("waiting");
  });

  it("approves once every mandatory participant has answered and the counts are met", () => {
    const responses: DecisionResponse[] = [
      ...RAVI_APPROVED,
      { memberId: "priya", capacity: "acknowledger", response: "acknowledge" },
    ];

    expect(
      statusAfter(
        decision(),
        PARTICIPANTS,
        responses,
        { memberId: "arun", capacity: "approver", response: "approve" },
        NOW,
      ),
    ).toBe("approved");
  });

  it("is rejected by one rejection, whatever else has been collected", () => {
    const responses: DecisionResponse[] = [
      ...RAVI_APPROVED,
      { memberId: "priya", capacity: "acknowledger", response: "acknowledge" },
    ];

    expect(
      statusAfter(
        decision(),
        PARTICIPANTS,
        responses,
        { memberId: "arun", capacity: "approver", response: "reject" },
        NOW,
      ),
    ).toBe("rejected");
  });
});

describe("progressFor", () => {
  it("counts an approver's yes as an acknowledgement too, and never twice", () => {
    const progress = progressFor(decision(), PARTICIPANTS, RAVI_APPROVED);

    expect(progress.approvals).toEqual({ given: 1, required: 2 });
    expect(progress.acknowledgements).toEqual({ given: 1, required: 1 });
    expect(progress.outstandingMandatory).toEqual(["priya"]);
  });
});

describe("the batch a stored queue produces", () => {
  it("excludes the Critical decision that would complete on this caller's tap", () => {
    const ready = candidateFrom(decision({ id: "ready" }), PARTICIPANTS, [
      ...RAVI_APPROVED,
      { memberId: "priya", capacity: "acknowledger", response: "acknowledge" },
    ]);
    const early = candidateFrom(decision({ id: "early" }), PARTICIPANTS, []);

    const plan = planBatch([ready, early], "arun", NOW);

    expect(plan.approve.map((entry) => entry.id)).toEqual(["early"]);
    expect(plan.skip).toEqual([
      { id: "ready", kind: "remove_member", reason: "CRITICAL_NEEDS_DELIBERATE_ACTION" },
    ]);
  });

  it("leaves out the proposer's own decisions and the ones they have answered", () => {
    const mine = candidateFrom(decision({ id: "mine" }), PARTICIPANTS, RAVI_APPROVED);
    const plan = planBatch([mine], "ravi", NOW);

    expect(plan.approve).toEqual([]);
    expect(plan.skip[0].reason).toBe("ALREADY_RESPONDED");
  });
});

describe("affirmativeFor", () => {
  it("never offers an acknowledger the veto they were not given", () => {
    expect(affirmativeFor("approver")).toBe("approve");
    expect(affirmativeFor("acknowledger")).toBe("acknowledge");
  });
});
