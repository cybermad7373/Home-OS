import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildSchedulePayload,
  validateProposal,
  type ProposalContext,
  type ScheduleProposal,
} from "@/lib/domain/llm/schedule";
import { findForbidden } from "@/lib/infra/llm/redact";
import type {
  ChoreInstance,
  SchedulingMember,
  WeekWindows,
} from "@/lib/domain/scheduling/types";

/**
 * Call site 1's validator — docs/10-LLM-SPEC.md sections 5.4 and 10.
 *
 * The point of every case here is the same: a proposal is published only if it
 * is complete, addressed to real people, breaks no hard constraint, and is not
 * materially less fair than the engine's. Anything else is discarded whole —
 * there is no repair pass and there never will be.
 */

const WEEK = "2026-08-24";

function windows(dates: string[], startMin = 6 * 60, endMin = 23 * 60): WeekWindows {
  return new Map(dates.map((date) => [date, [{ kind: "full" as const, startMin, endMin }]]));
}

function member(id: string, overrides: Partial<SchedulingMember> = {}): SchedulingMember {
  return {
    memberId: id,
    canCook: true,
    roomId: null,
    residency: "full_time",
    joinedDate: "2026-01-01",
    leftDate: null,
    ...overrides,
  };
}

function instance(id: string, overrides: Partial<ChoreInstance> = {}): ChoreInstance {
  return {
    id,
    templateId: `t-${id}`,
    name: "Cook dinner",
    choreDate: WEEK,
    slot: "any",
    effortPoints: 30,
    durationMin: 60,
    scope: "house",
    roomId: null,
    requiresCookingSkill: false,
    isHeavy: false,
    ...overrides,
  };
}

function context(overrides: Partial<ProposalContext> = {}): ProposalContext {
  const members = [member("uuid-ravi"), member("uuid-kumar")];
  const instances = [instance("i-a"), instance("i-b", { choreDate: "2026-08-25" })];

  return {
    weekStart: WEEK,
    instances,
    members,
    windowsByMember: new Map(
      members.map((m) => [m.memberId, windows([WEEK, "2026-08-25"])]),
    ),
    targets: new Map([
      ["uuid-ravi", 30],
      ["uuid-kumar", 30],
    ]),
    baselineMaxDeviation: 0,
    ...overrides,
  };
}

function payloadFor(ctx: ProposalContext) {
  return buildSchedulePayload({
    ...ctx,
    names: new Map(ctx.members.map((m, i) => [m.memberId, i === 0 ? "Ravi Kumar" : "Kumar S"])),
    canCookByMember: new Map(ctx.members.map((m) => [m.memberId, m.canCook])),
    roomByMember: new Map(ctx.members.map((m) => [m.memberId, m.roomId])),
    awayDatesByMember: new Map(),
    history: [],
    guests: [],
  });
}

function proposal(pairs: [string, string][], rationale = "Spread evenly."): ScheduleProposal {
  return {
    assignments: pairs.map(([instance_id, assignee_id]) => ({ instance_id, assignee_id })),
    rationale,
  };
}

describe("a valid proposal", () => {
  it("is accepted, with the assignments translated back to real ids", () => {
    const ctx = context();
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m1"],
        ["i2", "m2"],
      ]),
      maps,
      ctx,
    );

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.assignments).toEqual([
      { instanceId: "i-a", memberId: "uuid-ravi" },
      { instanceId: "i-b", memberId: "uuid-kumar" },
    ]);
  });
});

describe("an invalid proposal", () => {
  it("is rejected when an instance is missing", () => {
    const ctx = context();
    const { maps } = payloadFor(ctx);
    const result = validateProposal(proposal([["i1", "m1"]]), maps, ctx);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MISSING_INSTANCE:i2");
  });

  it("is rejected when an instance is assigned twice", () => {
    const ctx = context();
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m1"],
        ["i1", "m2"],
        ["i2", "m2"],
      ]),
      maps,
      ctx,
    );

    expect(result.errors).toContain("DUPLICATE_INSTANCE:i1");
  });

  it("is rejected when it names somebody who does not live here", () => {
    const ctx = context();
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m9"],
        ["i2", "m2"],
      ]),
      maps,
      ctx,
    );

    expect(result.errors).toContain("UNKNOWN_PERSON:m9");
  });

  it("is rejected with HC-1 when it ignores availability", () => {
    const ctx = context({
      windowsByMember: new Map([
        // Ravi leaves at 07:00: no room for a 60-minute chore plus the buffer.
        ["uuid-ravi", windows([WEEK, "2026-08-25"], 6 * 60, 7 * 60)],
        ["uuid-kumar", windows([WEEK, "2026-08-25"])],
      ]),
    });
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m1"],
        ["i2", "m2"],
      ]),
      maps,
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("HC-1:i1");
  });

  it("is rejected with HC-3 when it asks a non-cook to cook", () => {
    const members = [member("uuid-ravi", { canCook: false }), member("uuid-kumar")];
    const ctx = context({
      members,
      instances: [
        instance("i-a", { requiresCookingSkill: true }),
        instance("i-b", { choreDate: "2026-08-25" }),
      ],
      windowsByMember: new Map(members.map((m) => [m.memberId, windows([WEEK, "2026-08-25"])])),
    });
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m1"],
        ["i2", "m2"],
      ]),
      maps,
      ctx,
    );

    expect(result.errors).toContain("HC-3:i1");
  });

  it("is rejected with HC-6 when one person is given four chores in a day", () => {
    const members = [member("uuid-ravi"), member("uuid-kumar")];
    const instances = ["a", "b", "c", "d"].map((suffix) =>
      instance(`i-${suffix}`, { durationMin: 30, effortPoints: 10 }),
    );
    const ctx = context({
      members,
      instances,
      windowsByMember: new Map(members.map((m) => [m.memberId, windows([WEEK])])),
      targets: new Map([
        ["uuid-ravi", 40],
        ["uuid-kumar", 0],
      ]),
      baselineMaxDeviation: 40,
    });
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m1"],
        ["i2", "m1"],
        ["i3", "m1"],
        ["i4", "m1"],
      ]),
      maps,
      ctx,
    );

    expect(result.errors.some((error) => error.startsWith("HC-6"))).toBe(true);
  });

  it("is rejected by the deviation check when it gives all the work to one person", () => {
    const ctx = context({
      instances: [
        instance("i-a", { durationMin: 30 }),
        instance("i-b", { choreDate: "2026-08-25", durationMin: 30 }),
      ],
    });
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m1"],
        ["i2", "m1"],
      ]),
      maps,
      ctx,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith("WORSE_THAN_BASELINE"))).toBe(true);
  });

  it("allows a proposal within 15 per cent of the engine's deviation", () => {
    const ctx = context({
      targets: new Map([
        ["uuid-ravi", 20],
        ["uuid-kumar", 40],
      ]),
      baselineMaxDeviation: 10,
    });
    const { maps } = payloadFor(ctx);
    const result = validateProposal(
      proposal([
        ["i1", "m1"],
        ["i2", "m2"],
      ]),
      maps,
      ctx,
    );

    expect(result.maxDeviation).toBe(10);
    expect(result.valid).toBe(true);
  });
});

describe("the payload", () => {
  it("carries opaque ids, first names and nothing else about a person", () => {
    const ctx = context();
    const { payload } = payloadFor(ctx);
    const serialised = JSON.stringify(payload);

    expect(findForbidden(payload)).toEqual([]);
    expect(serialised).not.toContain("uuid-ravi");
    expect(serialised).not.toContain("Kumar S");
    expect(serialised).toContain('"name":"Ravi"');
  });

  it("never leaks an identifier, for any house the generator can produce", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            // A display name is never blank: the schema refuses one, and a
            // blank here would make the surname the first word.
            name: fc
              .string({ minLength: 1, maxLength: 40 })
              .filter((value) => value.trim().length > 0),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (people) => {
          const members = people.map((person) => member(person.id));
          const ctx = context({
            members,
            instances: [instance("i-a")],
            windowsByMember: new Map(members.map((m) => [m.memberId, windows([WEEK])])),
            targets: new Map(members.map((m) => [m.memberId, 30])),
          });

          const { payload } = buildSchedulePayload({
            ...ctx,
            names: new Map(people.map((person) => [person.id, `${person.name} Surname`])),
            canCookByMember: new Map(members.map((m) => [m.memberId, true])),
            roomByMember: new Map(members.map((m) => [m.memberId, null])),
            awayDatesByMember: new Map(),
            history: [],
            guests: [],
          });

          const serialised = JSON.stringify(payload);
          for (const person of people) {
            expect(serialised).not.toContain(person.id);
          }
          expect(serialised).not.toContain("Surname");
        },
      ),
      { numRuns: 200 },
    );
  });
});
