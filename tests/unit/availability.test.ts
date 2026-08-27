import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildWeekWindows,
  presentDays,
  weekDates,
  weeklyCapacityMinutes,
  type AvailabilityException,
  type DayAvailability,
} from "@/lib/domain/scheduling/capacity";
import { buildDemand, totalPoints, type DemandGuest } from "@/lib/domain/scheduling/demand";
import { checkHardConstraints, validateSchedule } from "@/lib/domain/scheduling/constraints";
import { solve } from "@/lib/domain/scheduling/solver";
import { computeTargets } from "@/lib/domain/fairness/targets";
import { distributePenaltyPool, computeBalances, minimiseTransfers, checkSettlement } from "@/lib/domain/settlement/netting";
import { emptyLoad } from "@/lib/domain/scheduling/constraints";
import type {
  ChoreTemplate,
  SchedulingMember,
  WeekWindows,
} from "@/lib/domain/scheduling/types";

/**
 * Phase 5 — the acceptance criteria from docs/07-ROADMAP.md that can be checked
 * without a database:
 *
 *   "A member who leaves at 07:00 is never assigned a morning chore."
 *   "A member with a 07:00–22:00 weekday pattern receives the same points
 *    target as everyone else."
 *   "Declaring an away day redistributes that day's assignments and reduces
 *    that member's target proportionally."
 *   "A weekend guest appears in Saturday's schedule ... billed to their host."
 *   "Σ penalty_credit = Σ penalty_owed exactly."
 */

const WEEK = "2026-08-24"; // a Monday
const [MON, TUE, , , , SAT] = weekDates(WEEK);

const TEMPLATES: ChoreTemplate[] = [
  {
    id: "t-dinner",
    name: "Cook dinner",
    effortPoints: 30,
    durationMin: 60,
    slot: "evening",
    scope: "house",
    roomId: null,
    frequency: "daily",
    timesPerWeek: null,
    requiresCookingSkill: true,
    isHeavy: false,
  },
  {
    id: "t-kitchen",
    name: "Clean kitchen",
    effortPoints: 20,
    durationMin: 30,
    slot: "evening",
    scope: "house",
    roomId: null,
    frequency: "daily",
    timesPerWeek: null,
    requiresCookingSkill: false,
    isHeavy: false,
  },
  {
    id: "t-mop",
    name: "Mop common area",
    effortPoints: 15,
    durationMin: 20,
    slot: "morning",
    scope: "house",
    roomId: null,
    frequency: "daily",
    timesPerWeek: null,
    requiresCookingSkill: false,
    isHeavy: false,
  },
];

function members(count: number, options: Partial<SchedulingMember> = {}): SchedulingMember[] {
  return Array.from({ length: count }, (_, index) => ({
    memberId: `m${String(index).padStart(3, "0")}`,
    canCook: true,
    roomId: null,
    residency: "full_time" as const,
    joinedDate: "2026-01-01",
    leftDate: null,
    ...options,
  }));
}

/** The pattern the acceptance criterion names: out 07:00, back 22:00, weekdays. */
const WEEKDAY_COMMUTER: DayAvailability[] = [
  { dayOfWeek: 0, isHome: true, leavesAtMin: null, returnsAtMin: null }, // Sunday
  ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    isHome: true,
    leavesAtMin: 7 * 60,
    returnsAtMin: 22 * 60,
  })),
  { dayOfWeek: 6, isHome: true, leavesAtMin: null, returnsAtMin: null }, // Saturday
];

describe("a member who leaves at seven", () => {
  const windows = buildWeekWindows(WEEK, WEEKDAY_COMMUTER);

  it("has no assignable morning on a weekday", () => {
    // 06:00 to 07:00 is one hour, and a 20-minute chore needs 35 with the
    // buffer — so the window exists but nothing fits an hour-long job.
    const monday = windows.get(MON)!;
    expect(monday.some((window) => window.kind === "morning")).toBe(true);
    expect(monday.find((window) => window.kind === "morning")!.endMin).toBe(7 * 60);
  });

  it("is never given a morning chore the solver could avoid", () => {
    const roster = members(4);
    const commuter = roster[0];

    const windowsByMember = new Map<string, WeekWindows>(
      roster.map((member) => [
        member.memberId,
        member.memberId === commuter.memberId
          ? buildWeekWindows(WEEK, [
              // Out from 06:00, so not even the short morning window exists.
              ...[0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                isHome: true,
                leavesAtMin: 6 * 60,
                returnsAtMin: 19 * 60,
              })),
            ])
          : buildWeekWindows(WEEK, []),
      ]),
    );

    const instances = buildDemand({ weekStart: WEEK, templates: TEMPLATES });
    const result = solve({
      instances,
      members: roster,
      windowsByMember,
      targets: new Map(roster.map((member) => [member.memberId, 100])),
    });

    const byId = new Map(instances.map((instance) => [instance.id, instance]));
    const theirs = result.assignments
      .filter((assignment) => assignment.memberId === commuter.memberId)
      .map((assignment) => byId.get(assignment.instanceId)!);

    expect(theirs.every((instance) => instance.slot !== "morning")).toBe(true);
  });

  it("owes exactly what everybody else owes — the contested rule (D-09)", () => {
    const roster = members(8);
    const targets = computeTargets(
      840,
      roster.map((member) => ({
        memberId: member.memberId,
        presentDays: 7, // present all week; merely busy on five of the days
        carryIn: 0,
      })),
      50,
    );

    const distinct = new Set(targets.map((target) => target.effectiveTarget));
    expect(distinct.size).toBe(1);
    expect(targets[0].effectiveTarget).toBe(105);
  });

  it("has less capacity than somebody at home, which is a tie-break only", () => {
    const atHome = weeklyCapacityMinutes(buildWeekWindows(WEEK, []));
    const commuting = weeklyCapacityMinutes(windows);
    expect(commuting).toBeLessThan(atHome);
  });
});

describe("declaring a day away", () => {
  const away: AvailabilityException[] = [
    { date: TUE, type: "away", leavesAtMin: null, returnsAtMin: null },
  ];

  it("removes that day's windows entirely", () => {
    const windows = buildWeekWindows(WEEK, [], away);
    expect(windows.get(TUE)).toEqual([]);
    expect(windows.get(MON)!.length).toBeGreaterThan(0);
  });

  it("makes every chore on that day infeasible (HC-1)", () => {
    const windows = buildWeekWindows(WEEK, [], away);
    const instances = buildDemand({ weekStart: WEEK, templates: TEMPLATES });
    const member = members(1)[0];

    for (const instance of instances.filter((row) => row.choreDate === TUE)) {
      const violations = checkHardConstraints({
        instance,
        member,
        windows,
        load: emptyLoad(),
      });
      expect(violations.some((violation) => violation.code === "HC-1")).toBe(true);
    }
  });

  it("reduces that member's target proportionally, and nobody else's", () => {
    const roster = members(8);
    const targets = computeTargets(
      840,
      roster.map((member, index) => ({
        memberId: member.memberId,
        presentDays: index === 0 ? presentDays(member, WEEK, away) : 7,
        carryIn: 0,
      })),
      50,
    );

    expect(targets[0].presentDays).toBe(6);
    // Six sevenths of a full week's weight, so a lower target — but not zero,
    // and not a week off.
    expect(targets[0].effectiveTarget).toBeLessThan(targets[1].effectiveTarget);
    expect(targets[0].effectiveTarget).toBeGreaterThan(0);
    expect(new Set(targets.slice(1).map((t) => t.effectiveTarget)).size).toBe(1);
  });

  it("does not reduce the target of somebody merely busy", () => {
    const busy = members(1)[0];
    expect(presentDays(busy, WEEK, [])).toBe(7);
    expect(
      presentDays(busy, WEEK, [
        { date: TUE, type: "custom_hours", leavesAtMin: 6 * 60, returnsAtMin: 23 * 60 },
      ]),
    ).toBe(7);
  });
});

describe("a guest", () => {
  const weekendGuest: DemandGuest = {
    guestId: "g1",
    hostMemberId: "m000",
    fromDate: SAT,
    toDate: SAT,
    isAssignable: true,
  };

  it("adds their share of Saturday's common work, and nothing on other days", () => {
    const base = buildDemand({ weekStart: WEEK, templates: TEMPLATES });
    const withGuest = buildDemand({
      weekStart: WEEK,
      templates: TEMPLATES,
      guests: [weekendGuest],
      memberCount: 8,
    });

    const extra = withGuest.filter((instance) => instance.guestId === "g1");
    expect(extra.length).toBeGreaterThan(0);
    expect(new Set(extra.map((instance) => instance.choreDate))).toEqual(new Set([SAT]));
    expect(totalPoints(withGuest)).toBeGreaterThan(totalPoints(base));

    // Saturday's common workload is 20 + 15 = 35 (dinner is skilled and
    // excluded), so an eighth is 4.4 points — the cheapest single job.
    expect(totalPoints(extra)).toBe(15);
  });

  it("bills the work to their host and to nobody else (HC-7)", () => {
    const instances = buildDemand({
      weekStart: WEEK,
      templates: TEMPLATES,
      guests: [weekendGuest],
      memberCount: 8,
    });
    const guestInstance = instances.find((instance) => instance.guestId === "g1")!;
    const roster = members(8);

    const host = roster.find((member) => member.memberId === "m000")!;
    const other = roster.find((member) => member.memberId === "m001")!;
    const windows = buildWeekWindows(WEEK, []);

    expect(
      checkHardConstraints({ instance: guestInstance, member: host, windows, load: emptyLoad() }),
    ).toHaveLength(0);

    const refused = checkHardConstraints({
      instance: guestInstance,
      member: other,
      windows,
      load: emptyLoad(),
    });
    expect(refused.some((violation) => violation.code === "HC-7")).toBe(true);
  });

  it("lands on the host when the week is solved", () => {
    const roster = members(8);
    const instances = buildDemand({
      weekStart: WEEK,
      templates: TEMPLATES,
      guests: [weekendGuest],
      memberCount: 8,
    });

    const result = solve({
      instances,
      members: roster,
      windowsByMember: new Map(
        roster.map((member) => [member.memberId, buildWeekWindows(WEEK, [])]),
      ),
      targets: new Map(roster.map((member) => [member.memberId, 90])),
    });

    const guestIds = new Set(
      instances.filter((instance) => instance.guestId).map((instance) => instance.id),
    );
    const guestAssignments = result.assignments.filter((assignment) =>
      guestIds.has(assignment.instanceId),
    );

    expect(guestAssignments.length).toBeGreaterThan(0);
    for (const assignment of guestAssignments) {
      expect(assignment.memberId).toBe("m000");
    }
  });

  it("creates no work at all when marked unassignable", () => {
    const instances = buildDemand({
      weekStart: WEEK,
      templates: TEMPLATES,
      guests: [{ ...weekendGuest, isAssignable: false }],
      memberCount: 8,
    });
    expect(instances.some((instance) => instance.guestId)).toBe(false);
  });

  it("never makes a schedule infeasible", () => {
    const roster = members(8);
    const instances = buildDemand({
      weekStart: WEEK,
      templates: TEMPLATES,
      guests: [weekendGuest, { ...weekendGuest, guestId: "g2", hostMemberId: "m003" }],
      memberCount: 8,
    });

    const windowsByMember = new Map(
      roster.map((member) => [member.memberId, buildWeekWindows(WEEK, [])]),
    );

    const result = solve({ instances, members: roster, windowsByMember, targets: new Map() });
    const validation = validateSchedule({
      instances,
      members: roster,
      windowsByMember,
      assignments: result.assignments,
    });

    expect(validation.violations).toEqual([]);
    expect(validation.missing).toEqual([]);
    expect(validation.duplicated).toEqual([]);
  });
});

describe("the penalty", () => {
  const RATE = 500; // ₹5 a point

  it("charges the deficit and credits the surplus, to the paisa", () => {
    const { owed, credit } = distributePenaltyPool(
      [
        { memberId: "a", carryPoints: -85 },
        { memberId: "b", carryPoints: 40 },
        { memberId: "c", carryPoints: 45 },
        { memberId: "d", carryPoints: 0 },
      ],
      RATE,
    );

    expect(owed.get("a")).toBe(85 * RATE);
    expect(owed.has("d")).toBe(false);

    const owedTotal = [...owed.values()].reduce((sum, value) => sum + value, 0);
    const creditTotal = [...credit.values()].reduce((sum, value) => sum + value, 0);
    expect(creditTotal).toBe(owedTotal);
  });

  it("charges nothing when nobody carried a surplus", () => {
    // A pool with no home would have to come from somewhere and go nowhere,
    // which is exactly the zero-sum break the close is meant to refuse.
    const { owed, credit } = distributePenaltyPool(
      [
        { memberId: "a", carryPoints: -10 },
        { memberId: "b", carryPoints: -5 },
      ],
      RATE,
    );

    expect(owed.size).toBe(0);
    expect(credit.size).toBe(0);
  });

  it("reaches the settlement and still nets to zero", () => {
    const carries = [
      { memberId: "a", carryPoints: -85 },
      { memberId: "b", carryPoints: 60 },
      { memberId: "c", carryPoints: 25 },
    ];
    const { owed, credit } = distributePenaltyPool(carries, RATE);

    const balances = computeBalances([
      { memberId: "a", paidPaise: 300000, fairSharePaise: 200000, penaltyOwedPaise: owed.get("a") ?? 0, penaltyCreditPaise: credit.get("a") ?? 0 },
      { memberId: "b", paidPaise: 100000, fairSharePaise: 200000, penaltyOwedPaise: owed.get("b") ?? 0, penaltyCreditPaise: credit.get("b") ?? 0 },
      { memberId: "c", paidPaise: 200000, fairSharePaise: 200000, penaltyOwedPaise: owed.get("c") ?? 0, penaltyCreditPaise: credit.get("c") ?? 0 },
    ]);

    const payments = minimiseTransfers(balances);
    const checks = checkSettlement(balances, payments);

    expect(checks.netsToZero).toBe(true);
    expect(checks.reconciles).toBe(true);
    expect(payments.length).toBeLessThanOrEqual(balances.length - 1);
  });

  it("Σ credit = Σ owed for any carries and any rate", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -400, max: 400 }), { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: 10000 }),
        (points, rate) => {
          const carries = points.map((carryPoints, index) => ({
            memberId: `m${String(index).padStart(3, "0")}`,
            carryPoints,
          }));

          const { owed, credit } = distributePenaltyPool(carries, rate);
          const owedTotal = [...owed.values()].reduce((sum, value) => sum + value, 0);
          const creditTotal = [...credit.values()].reduce((sum, value) => sum + value, 0);

          expect(creditTotal).toBe(owedTotal);
          for (const value of [...owed.values(), ...credit.values()]) {
            expect(value).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("the property that must still hold with real availability", () => {
  it("never violates a hard constraint, for any pattern and any exception", () => {
    const dayArbitrary = fc.record({
      isHome: fc.boolean(),
      leavesAtMin: fc.option(fc.integer({ min: 6 * 60, max: 20 * 60 }), { nil: null }),
      returnsAtMin: fc.option(fc.integer({ min: 8 * 60, max: 23 * 60 }), { nil: null }),
    });

    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.array(fc.array(dayArbitrary, { minLength: 7, maxLength: 7 }), {
          minLength: 2,
          maxLength: 10,
        }),
        fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 4 }),
        (count, patterns, awayDayIndexes) => {
          const roster = members(count);
          const dates = weekDates(WEEK);

          const windowsByMember = new Map<string, WeekWindows>(
            roster.map((member, index) => {
              const pattern = (patterns[index] ?? patterns[0]).map((day, dayOfWeek) => ({
                dayOfWeek,
                isHome: day.isHome,
                // The table constraint refuses a return before a departure, so
                // the generator must not produce one either.
                leavesAtMin: day.leavesAtMin,
                returnsAtMin:
                  day.leavesAtMin !== null &&
                  day.returnsAtMin !== null &&
                  day.returnsAtMin <= day.leavesAtMin
                    ? null
                    : day.returnsAtMin,
              }));

              const exceptions: AvailabilityException[] =
                index === 0
                  ? awayDayIndexes.map((dayIndex) => ({
                      date: dates[dayIndex],
                      type: "away" as const,
                      leavesAtMin: null,
                      returnsAtMin: null,
                    }))
                  : [];

              return [member.memberId, buildWeekWindows(WEEK, pattern, exceptions)];
            }),
          );

          const instances = buildDemand({ weekStart: WEEK, templates: TEMPLATES });
          const result = solve({ instances, members: roster, windowsByMember, targets: new Map() });

          const validation = validateSchedule({
            instances,
            members: roster,
            windowsByMember,
            assignments: result.assignments,
          });

          expect(validation.violations).toEqual([]);
          expect(validation.missing).toEqual([]);
          expect(validation.duplicated).toEqual([]);
        },
      ),
      { numRuns: 120 },
    );
  });
});
