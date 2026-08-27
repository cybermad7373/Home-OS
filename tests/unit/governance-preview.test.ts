import { describe, expect, it } from "vitest";
import {
  askFrom,
  deadlinePhrase,
  expectationLine,
  reasonRequired,
  responsesPhrase,
} from "@/lib/domain/governance/preview";
import { selectParticipants } from "@/lib/domain/governance/participants";
import {
  DEFAULT_POLICY,
  type GovernanceMember,
  type Requirement,
} from "@/lib/domain/governance/types";

/**
 * S-37's copy, as assertions — docs/08-UI-UX-SPEC.md.
 *
 * The sheet promises three facts before somebody asks the Home: who is asked,
 * how many must answer, and how long they have. These are the cases where the
 * wording is load-bearing rather than decorative.
 */

function home(...spec: [string, "admin" | "co_admin" | "member"][]): GovernanceMember[] {
  return spec.map(([id, role]) => ({ id, role, status: "active", kind: "adult" }));
}

function askFor(members: GovernanceMember[], subjectMemberId?: string) {
  const selection = selectParticipants({
    proposal: { type: "remove_member", proposerId: "ravi", subjectMemberId },
    members,
    policy: DEFAULT_POLICY,
  });
  if ("refusal" in selection) throw new Error(selection.refusal);
  return askFrom(selection.requirement);
}

const BASE: Requirement = {
  level: "critical",
  participants: [],
  requiredApprovals: 0,
  requiredAcks: 0,
  deadlineHours: null,
  autoApprove: false,
};

describe("the ask, derived from the requirement", () => {
  it("carries the selector's counts through unchanged", () => {
    const ask = askFor(
      home(["ravi", "admin"], ["kumar", "co_admin"], ["asha", "member"], ["dev", "member"]),
      "dev",
    );

    expect(ask.level).toBe("critical");
    expect(ask.participantCount).toBe(3);
    expect(ask.requiredApprovals + ask.requiredAcks).toBeGreaterThanOrEqual(2);
    expect(ask.autoApprove).toBe(false);
  });

  it("reports the one-person Home as auto-approving rather than as a quorum", () => {
    const ask = askFor(home(["ravi", "admin"]));

    expect(ask.autoApprove).toBe(true);
    expect(ask.participantCount).toBe(0);
    expect(expectationLine(ask)).toContain("takes effect as soon as you propose it");
  });

  it("promises nothing changes until they respond, in every other Home", () => {
    const ask = askFor(home(["ravi", "admin"], ["kumar", "co_admin"], ["asha", "member"]));

    expect(expectationLine(ask)).toBe("Nothing changes until they respond.");
  });
});

describe("responsesPhrase", () => {
  it("names both kinds when both are needed", () => {
    expect(
      responsesPhrase(askFrom({ ...BASE, requiredApprovals: 2, requiredAcks: 1 })),
    ).toBe("2 approvals and 1 acknowledgement");
  });

  it("says one approval in the singular", () => {
    expect(responsesPhrase(askFrom({ ...BASE, requiredApprovals: 1 }))).toBe("1 approval");
  });

  it("is null when there is nothing to collect", () => {
    expect(responsesPhrase(askFrom(BASE))).toBeNull();
  });
});

describe("deadlinePhrase", () => {
  it("speaks in days when the hours divide evenly, because the policy does", () => {
    expect(deadlinePhrase(168)).toBe("7 days");
    expect(deadlinePhrase(24)).toBe("1 day");
  });

  it("keeps hours when they do not", () => {
    expect(deadlinePhrase(48)).toBe("2 days");
    expect(deadlinePhrase(36)).toBe("36 hours");
    expect(deadlinePhrase(1)).toBe("1 hour");
  });

  it("is null for a decision that sits until it is answered", () => {
    expect(deadlinePhrase(null)).toBeNull();
    expect(deadlinePhrase(0)).toBeNull();
  });
});

describe("reasonRequired", () => {
  it("is true for Critical and false for the rest (spec section 3)", () => {
    expect(reasonRequired("critical")).toBe(true);
    expect(reasonRequired("important")).toBe(false);
    expect(reasonRequired("normal")).toBe(false);
  });
});
