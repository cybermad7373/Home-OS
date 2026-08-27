import { describe, expect, it } from "vitest";
import { selectParticipants, thresholdFor } from "@/lib/domain/governance/participants";
import { progressOf, resolve, wouldComplete } from "@/lib/domain/governance/resolve";
import { quorumFor, quorumMet } from "@/lib/domain/governance/quorum";
import { planApproveAll } from "@/lib/domain/governance/approvals";
import { DECISION_LEVEL } from "@/lib/domain/governance/matrix";
import {
  DEFAULT_POLICY,
  type DecisionResponse,
  type GovernanceMember,
  type Requirement,
} from "@/lib/domain/governance/types";

/**
 * The governance engine, case by case — docs/14-GOVERNANCE-SPEC.md.
 *
 * The randomised property lives in `governance-property.test.ts`. This file is
 * the named cases the specification states in words, each one a sentence from
 * the document turned into an assertion.
 */

function home(...spec: [string, "admin" | "co_admin" | "member", ("adult" | "dependent")?][]) {
  return spec.map<GovernanceMember>(([id, role, kind]) => ({
    id,
    role,
    status: "active",
    kind: kind ?? "adult",
  }));
}

const NOW = new Date("2026-08-27T00:00:00Z");
const LATER = new Date("2026-09-27T00:00:00Z");

function requirementFor(
  members: GovernanceMember[],
  type: Parameters<typeof selectParticipants>[0]["proposal"]["type"],
  proposerId = "ravi",
  subjectMemberId?: string,
): Requirement {
  const selection = selectParticipants({
    proposal: { type, proposerId, subjectMemberId },
    members,
    policy: DEFAULT_POLICY,
  });
  if ("refusal" in selection) throw new Error(`refused: ${selection.refusal}`);
  return selection.requirement;
}

describe("the level matrix", () => {
  it("keeps the everyday actions out of governance", () => {
    expect(DECISION_LEVEL.expense_approval).toBe("normal");
    expect(DECISION_LEVEL.chore_confirmation).toBe("normal");
    expect(DECISION_LEVEL.absence_request).toBe("important");
  });

  it("puts every money-moving and rule-changing action at critical", () => {
    for (const type of [
      "close_settlement",
      "reopen_settlement",
      "remove_member",
      "change_rule",
      "change_governance",
      "change_home_mode",
      "balance_adjustment",
      "reserve_draw",
    ] as const) {
      expect(DECISION_LEVEL[type], type).toBe("critical");
    }
  });
});

describe("thresholds", () => {
  it("rounds a proportion up, so half of five is three", () => {
    expect(thresholdFor(DEFAULT_POLICY, 5)).toBe(3);
    expect(thresholdFor(DEFAULT_POLICY, 4)).toBe(2);
    expect(thresholdFor(DEFAULT_POLICY, 1)).toBe(1);
  });

  it("never asks for more people than the pool holds", () => {
    expect(
      thresholdFor({ ...DEFAULT_POLICY, criticalMemberRule: "count", criticalMemberValue: 9 }, 3),
    ).toBe(3);
  });
});

describe("participant selection", () => {
  it("never makes the subject of a decision a participant in it", () => {
    const members = home(["ravi", "admin"], ["kumar", "co_admin"], ["vinoth", "member"]);
    const requirement = requirementFor(members, "remove_member", "ravi", "vinoth");
    expect(requirement.participants.map((p) => p.memberId)).not.toContain("vinoth");
  });

  it("makes the proposer a mandatory approver and the co-admin a mandatory acknowledger", () => {
    const members = home(["ravi", "admin"], ["kumar", "co_admin"], ["vinoth", "member"]);
    const requirement = requirementFor(members, "close_settlement");

    expect(requirement.participants).toContainEqual({
      memberId: "ravi",
      capacity: "approver",
      isMandatory: true,
    });
    expect(requirement.participants).toContainEqual({
      memberId: "kumar",
      capacity: "acknowledger",
      isMandatory: true,
    });
  });

  it("leaves dependents out of every pool", () => {
    const members = home(
      ["ravi", "admin"],
      ["kumar", "member"],
      ["meera", "member", "dependent"],
    );
    const requirement = requirementFor(members, "close_settlement");
    expect(requirement.participants.map((p) => p.memberId)).not.toContain("meera");
  });

  it("refuses a two-person removal, because there is nobody left to ask", () => {
    const selection = selectParticipants({
      proposal: { type: "remove_member", proposerId: "ravi", subjectMemberId: "kumar" },
      members: home(["ravi", "admin"], ["kumar", "member"]),
      policy: DEFAULT_POLICY,
    });
    expect(selection).toEqual({ refusal: "NOT_ENOUGH_PARTICIPANTS" });
  });

  it("keeps a two-person close possible, and needing both of them", () => {
    const members = home(["ravi", "admin"], ["kumar", "member"]);
    const requirement = requirementFor(members, "close_settlement");

    const aloneStatus = resolve({
      requirement,
      responses: [{ memberId: "ravi", capacity: "approver", response: "approve" }],
      now: NOW,
      deadline: LATER,
    });
    expect(aloneStatus).toBe("waiting");

    const bothStatus = resolve({
      requirement,
      responses: [
        { memberId: "ravi", capacity: "approver", response: "approve" },
        { memberId: "kumar", capacity: "acknowledger", response: "acknowledge" },
      ],
      now: NOW,
      deadline: LATER,
    });
    expect(bothStatus).toBe("approved");
  });

  it("needs every affected member on a balance adjustment, not half of them", () => {
    const members = home(
      ["ravi", "admin"],
      ["kumar", "member"],
      ["vinoth", "member"],
      ["arun", "member"],
    );
    const requirement = requirementFor(members, "balance_adjustment");
    const approvers = requirement.participants.filter((p) => p.capacity === "approver");
    expect(requirement.requiredApprovals).toBe(approvers.length);
  });

  it("asks everybody to acknowledge a governance change", () => {
    const members = home(
      ["ravi", "admin"],
      ["kumar", "co_admin"],
      ["vinoth", "member"],
      ["arun", "member"],
    );
    const requirement = requirementFor(members, "change_governance");
    const acks = requirement.participants.filter((p) => p.capacity === "acknowledger");
    expect(requirement.requiredAcks).toBe(acks.length);
  });
});

describe("the resolver", () => {
  const members = home(
    ["ravi", "admin"],
    ["kumar", "co_admin"],
    ["vinoth", "member"],
    ["arun", "member"],
    ["deepak", "member"],
  );

  it("resolves rejected the moment one approver rejects, whatever else was collected", () => {
    const requirement = requirementFor(members, "reopen_settlement");
    const responses: DecisionResponse[] = requirement.participants.map((p) => ({
      memberId: p.memberId,
      capacity: p.capacity,
      response: p.capacity === "approver" ? "approve" : "acknowledge",
    }));
    responses[responses.length - 1] = {
      memberId: responses[responses.length - 1].memberId,
      capacity: "approver",
      response: "reject",
    };

    expect(resolve({ requirement, responses, now: NOW, deadline: LATER })).toBe("rejected");
  });

  it("lapses once the deadline passes with the counts unmet", () => {
    const requirement = requirementFor(members, "close_settlement");
    expect(
      resolve({ requirement, responses: [], now: LATER, deadline: NOW }),
    ).toBe("lapsed");
  });

  it("never lapses a decision with no deadline", () => {
    const requirement = requirementFor(members, "expense_approval", "ravi", "kumar");
    expect(
      resolve({ requirement, responses: [], now: LATER, deadline: null }),
    ).toBe("waiting");
  });

  it("ignores a response from somebody who is not a participant", () => {
    const requirement = requirementFor(members, "close_settlement");
    const status = resolve({
      requirement,
      responses: [
        { memberId: "a-stranger", capacity: "approver", response: "approve" },
        { memberId: "another", capacity: "acknowledger", response: "acknowledge" },
      ],
      now: NOW,
      deadline: LATER,
    });
    expect(status).toBe("waiting");
  });

  it("holds a decision open while a mandatory participant is silent, however many others agree", () => {
    const requirement = requirementFor(members, "close_settlement");
    const withoutCoAdmin = requirement.participants
      .filter((p) => p.memberId !== "kumar")
      .map<DecisionResponse>((p) => ({
        memberId: p.memberId,
        capacity: p.capacity,
        response: p.capacity === "approver" ? "approve" : "acknowledge",
      }));

    expect(
      resolve({ requirement, responses: withoutCoAdmin, now: NOW, deadline: LATER }),
    ).toBe("waiting");
    expect(
      progressOf({ requirement, responses: withoutCoAdmin }).outstandingMandatory,
    ).toEqual(["kumar"]);
  });
});

describe("Approve All", () => {
  // Five, so that the acknowledgement threshold is three and a decision can be
  // both still waiting and one tap from done — which is the only state the
  // rule under test is about.
  const members = home(
    ["ravi", "admin"],
    ["kumar", "co_admin"],
    ["vinoth", "member"],
    ["arun", "member"],
    ["deepak", "member"],
  );

  function candidate(overrides: Partial<Parameters<typeof planApproveAll>[0][number]> = {}) {
    return {
      id: "d1",
      type: "close_settlement" as const,
      kind: "settlement",
      requirement: requirementFor(members, "close_settlement"),
      responses: [] as DecisionResponse[],
      requestedByMemberId: "ravi",
      subjectMemberId: null,
      deadline: LATER,
      ...overrides,
    };
  }

  it("skips a Critical decision that would complete on the caller's tap, and names why", () => {
    const requirement = requirementFor(members, "close_settlement");
    // The proposer and the Co-Admin have answered, and one member. That is two
    // acknowledgements of the three needed, with every mandatory participant
    // in: Arun's acknowledgement is the one that finishes it.
    const responses: DecisionResponse[] = [
      { memberId: "ravi", capacity: "approver", response: "approve" },
      { memberId: "kumar", capacity: "acknowledger", response: "acknowledge" },
    ];

    expect(wouldComplete({ requirement, responses }, "arun")).toBe(true);

    const plan = planApproveAll([candidate({ requirement, responses })], "arun", NOW);
    expect(plan.approve).toEqual([]);
    expect(plan.skip).toEqual([
      { id: "d1", kind: "settlement", reason: "CRITICAL_NEEDS_DELIBERATE_ACTION" },
    ]);
  });

  it("batches the same decision when somebody else is still outstanding", () => {
    const plan = planApproveAll([candidate()], "arun", NOW);
    expect(plan.approve).toEqual([{ id: "d1", capacity: "acknowledger" }]);
  });

  it("never batches the proposer's own decision, or one about the caller", () => {
    expect(planApproveAll([candidate()], "ravi", NOW).skip[0].reason).toBe(
      "CALLER_IS_SUBJECT_OR_PROPOSER",
    );
    expect(
      planApproveAll([candidate({ subjectMemberId: "arun" })], "arun", NOW).skip[0]
        .reason,
    ).toBe("CALLER_IS_SUBJECT_OR_PROPOSER");
  });

  it("never batches twice for the same person", () => {
    const responses: DecisionResponse[] = [
      { memberId: "arun", capacity: "acknowledger", response: "acknowledge" },
    ];
    expect(planApproveAll([candidate({ responses })], "arun", NOW).skip[0].reason).toBe(
      "ALREADY_RESPONDED",
    );
  });
});

describe("the chore confirmation quorum", () => {
  const four = home(
    ["ravi", "admin"],
    ["kumar", "member"],
    ["vinoth", "member"],
    ["arun", "member"],
  );

  it("auto-confirms in a Home of one, because there is nobody to ask", () => {
    expect(quorumFor(home(["ravi", "admin"]), "ravi")).toMatchObject({
      autoConfirm: true,
      required: 0,
    });
  });

  it("asks one other person in a Home of two or three", () => {
    expect(quorumFor(home(["ravi", "admin"], ["kumar", "member"]), "ravi")).toMatchObject(
      { required: 1, leadRequired: false },
    );
  });

  it("asks a lead plus one other in a Home of four to six", () => {
    expect(quorumFor(four, "kumar")).toMatchObject({ required: 2, leadRequired: true });
  });

  it("is not satisfied by three ordinary members in a Home of four", () => {
    const quorum = quorumFor(four, "ravi" /* the admin did the chore */);
    // The only lead is the assignee, so no lead signature is obtainable and
    // the quorum drops the requirement rather than stalling every chore.
    expect(quorum.leadRequired).toBe(false);

    const withLead = quorumFor(four, "kumar");
    expect(
      quorumMet(withLead, [
        { memberId: "vinoth", isLead: false },
        { memberId: "arun", isLead: false },
      ]),
    ).toBe(false);
    expect(
      quorumMet(withLead, [
        { memberId: "vinoth", isLead: false },
        { memberId: "ravi", isLead: true },
      ]),
    ).toBe(true);
  });

  it("asks a lead plus two others from seven people up", () => {
    const seven = home(
      ["ravi", "admin"],
      ["kumar", "co_admin"],
      ["a", "member"],
      ["b", "member"],
      ["c", "member"],
      ["d", "member"],
      ["e", "member"],
    );
    expect(quorumFor(seven, "a")).toMatchObject({ required: 3, leadRequired: true });
  });

  it("counts one person once, however many times they confirm", () => {
    const quorum = quorumFor(four, "kumar");
    expect(
      quorumMet(quorum, [
        { memberId: "vinoth", isLead: false },
        { memberId: "vinoth", isLead: false },
      ]),
    ).toBe(false);
  });

  it("lets a Family Home switch it off entirely (CE-10)", () => {
    expect(quorumFor(four, "kumar", "off")).toMatchObject({ autoConfirm: true });
    expect(quorumFor(four, "kumar", "single")).toMatchObject({
      required: 1,
      leadRequired: false,
    });
  });
});
