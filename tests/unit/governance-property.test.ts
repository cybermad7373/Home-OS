import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { selectParticipants } from "@/lib/domain/governance/participants";
import { resolve } from "@/lib/domain/governance/resolve";
import { CRITICAL_TYPES } from "@/lib/domain/governance/matrix";
import {
  DEFAULT_POLICY,
  type DecisionResponse,
  type GovernanceMember,
  type GovernancePolicy,
  type MemberRole,
} from "@/lib/domain/governance/types";

/**
 * The property version 2.0 exists to protect, from `DECISIONS.md` and
 * `PROGRESS.md`:
 *
 *   In a Home of two or more people, no single member's responses can complete
 *   a Critical decision.
 *
 * It is written the way `Σ splits = amount` and `Σ final_net = 0` are written,
 * for the same reason: it fails silently while looking like a working feature.
 * A governance engine that quietly lets the Admin approve their own settlement
 * close is indistinguishable, from the outside, from one that does not.
 *
 * The randomisation matters. The interesting failures are not in a five-person
 * Home with one Admin; they are at the edges — two people, no Co-Admin, three
 * Co-Admins and no ordinary member, a Home that is all dependents but one.
 */

const roleArb: fc.Arbitrary<MemberRole> = fc.constantFrom("admin", "co_admin", "member");

/** A Home with at least one Admin, because every Home has one by construction. */
function homeArb(minSize: number, maxSize: number): fc.Arbitrary<GovernanceMember[]> {
  return fc
    .array(
      fc.record({
        role: roleArb,
        kind: fc.constantFrom<"adult" | "dependent">("adult", "dependent"),
      }),
      { minLength: minSize - 1, maxLength: maxSize - 1 },
    )
    .map((rest) => [
      { id: "m0", role: "admin" as MemberRole, status: "active" as const, kind: "adult" as const },
      ...rest.map((member, index) => ({
        id: `m${index + 1}`,
        role: member.role,
        status: "active" as const,
        kind: member.kind,
      })),
    ]);
}

const policyArb: fc.Arbitrary<GovernancePolicy> = fc.record({
  criticalRequiresCoadmin: fc.boolean(),
  criticalMemberRule: fc.constantFrom<"count" | "proportion">("count", "proportion"),
  criticalMemberValue: fc.integer({ min: 1, max: 100 }),
  governanceRequiresAll: fc.boolean(),
  absenceApproverRoles: fc.constant<MemberRole[]>(["admin", "co_admin"]),
  joinApproverRoles: fc.constant<MemberRole[]>(["admin", "co_admin"]),
  expenseApprovalsRequired: fc.integer({ min: 1, max: 3 }),
  decisionDeadlineDays: fc.integer({ min: 1, max: 30 }),
  absenceDeadlineHours: fc.integer({ min: 1, max: 168 }),
});

/**
 * Everything one member could possibly say, in every capacity they hold.
 *
 * The attack is not "the Admin approves once". It is "the Admin approves, and
 * acknowledges, and does both in both capacities" — because a resolver that
 * counts responses rather than responders will happily let that reach a
 * threshold of two.
 */
function everythingOnePersonCouldSay(
  memberId: string,
  participants: { memberId: string; capacity: "approver" | "acknowledger" }[],
): DecisionResponse[] {
  return participants
    .filter((participant) => participant.memberId === memberId)
    .flatMap((participant) =>
      participant.capacity === "approver"
        ? [
            { memberId, capacity: "approver" as const, response: "approve" as const },
            { memberId, capacity: "approver" as const, response: "acknowledge" as const },
          ]
        : [{ memberId, capacity: "acknowledger" as const, response: "acknowledge" as const }],
    );
}

describe("the Critical-decision property", () => {
  it("lets no single member complete a Critical decision in a Home of two or more", () => {
    fc.assert(
      fc.property(
        homeArb(2, 9),
        policyArb,
        fc.constantFrom(...CRITICAL_TYPES),
        fc.nat(),
        (members, policy, type, subjectSeed) => {
          const adults = members.filter((member) => member.kind === "adult");
          // A Home whose only adult is the Admin is the one-person case, which
          // the specification exempts by name. Everything else is in scope.
          fc.pre(adults.length >= 2);

          const subject =
            type === "remove_member"
              ? adults[subjectSeed % adults.length].id
              : undefined;

          const selection = selectParticipants({
            proposal: { type, proposerId: "m0", subjectMemberId: subject },
            members,
            policy,
          });

          // A proposal that cannot resolve is refused rather than raised. That
          // is a pass: nobody completed anything.
          if ("refusal" in selection) return;

          const requirement = selection.requirement;
          fc.pre(!requirement.autoApprove);

          for (const member of members) {
            const responses = everythingOnePersonCouldSay(
              member.id,
              requirement.participants,
            );
            const status = resolve({
              requirement,
              responses,
              now: new Date("2026-08-27T00:00:00Z"),
              deadline: new Date("2026-09-27T00:00:00Z"),
            });

            expect(
              status,
              `${member.id} alone reached ${status} on a ${type} in a Home of ${members.length}`,
            ).not.toBe("approved");
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it("still refuses when the lone responder is the proposer, whose proposal counts as approval", () => {
    const members: GovernanceMember[] = [
      { id: "m0", role: "admin", status: "active", kind: "adult" },
      { id: "m1", role: "co_admin", status: "active", kind: "adult" },
      { id: "m2", role: "member", status: "active", kind: "adult" },
    ];

    const selection = selectParticipants({
      proposal: { type: "close_settlement", proposerId: "m0" },
      members,
      policy: DEFAULT_POLICY,
    });
    if ("refusal" in selection) throw new Error("the proposal should have been raised");

    const status = resolve({
      requirement: selection.requirement,
      responses: [{ memberId: "m0", capacity: "approver", response: "approve" }],
      now: new Date("2026-08-27T00:00:00Z"),
      deadline: new Date("2026-09-27T00:00:00Z"),
    });

    expect(status).toBe("waiting");
  });

  it("exempts the one-person Home, and says so rather than pretending a quorum", () => {
    const selection = selectParticipants({
      proposal: { type: "close_settlement", proposerId: "m0" },
      members: [{ id: "m0", role: "admin", status: "active", kind: "adult" }],
      policy: DEFAULT_POLICY,
    });
    if ("refusal" in selection) throw new Error("a one-person Home may still close its month");

    expect(selection.requirement.autoApprove).toBe(true);
  });
});
