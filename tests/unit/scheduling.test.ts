import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildWeekWindows,
  fits,
  presentDays,
  timeToMinutes,
  weekDates,
  weeklyCapacityMinutes,
  windowsForDate,
  type DayAvailability,
} from "@/lib/domain/scheduling/capacity";
import { buildDemand, spreadAcrossWeek, totalPoints } from "@/lib/domain/scheduling/demand";
import { validateSchedule } from "@/lib/domain/scheduling/constraints";
import { solve } from "@/lib/domain/scheduling/solver";
import {
  closeWeek,
  computeTargets,
  concentrationRatio,
  rankStanding,
} from "@/lib/domain/fairness/targets";
import type {
  ChoreTemplate,
  SchedulingMember,
  WeekWindows,
} from "@/lib/domain/scheduling/types";

/**
 * The phase-4 properties from docs/02-TRD.md section 9 and
 * docs/06-ALGORITHMS.md section 5:
 *
 *   "A generated schedule never violates a hard constraint, for any randomly
 *    generated availability configuration."
 *   "Every instance is either assigned or marked OPEN; none is silently
 *    dropped."
 */

const WEEK = "2026-08-24"; // a Monday

const DEFAULT_TEMPLATES: ChoreTemplate[] = [
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
    id: "t-bathroom",
    name: "Clean bathroom",
    effortPoints: 25,
    durationMin: 30,
    slot: "any",
    scope: "house",
    roomId: null,
    frequency: "times_per_week",
    timesPerWeek: 2,
    requiresCookingSkill: false,
    isHeavy: true,
  },
  {
    id: "t-mop",
    name: "Mop common area",
    effortPoints: 15,
    durationMin: 20,
    slot: "morning",
    scope: "house",
    roomId: null,
    frequency: "times_per_week",
    timesPerWeek: 3,
    requiresCookingSkill: false,
    isHeavy: false,
  },
];

function members(count: number, options: Partial<SchedulingMember> = {}): SchedulingMember[] {
  return Array.from({ length: count }, (_, index) => ({
    memberId: `m${String(index).padStart(3, "0")}`,
    canCook: index % 3 === 0,
    roomId: null,
    residency: "full_time" as const,
    joinedDate: "2026-01-01",
    leftDate: null,
    ...options,
  }));
}

/** Everybody home all day — the phase-4 simplification. */
function alwaysHome(roster: SchedulingMember[]): Map<string, WeekWindows> {
  return new Map(
    roster.map((member) => [member.memberId, buildWeekWindows(WEEK, [])]),
  );
}

describe("availability windows", () => {
  it("gives a full day when no pattern is recorded (BR-020)", () => {
    // Assuming somebody is out would quietly excuse them from work, which is
    // the failure the product exists to fix.
    expect(windowsForDate(WEEK, undefined)).toEqual([
      { kind: "full", startMin: 360, endMin: 1380 },
    ]);
  });

  it("splits a working day into a morning and an evening window", () => {
    const weekday: DayAvailability = {
      dayOfWeek: 1,
      isHome: true,
      leavesAtMin: timeToMinutes("09:30"),
      returnsAtMin: timeToMinutes("19:00"),
    };

    expect(windowsForDate(WEEK, weekday)).toEqual([
      { kind: "morning", startMin: 360, endMin: 570 }, // 06:00–09:30
      { kind: "evening", startMin: 1140, endMin: 1380 }, // 19:00–23:00
    ]);
  });

  it("gives nothing at all on an away day", () => {
    expect(
      windowsForDate(WEEK, undefined, {
        date: WEEK,
        type: "away",
        leavesAtMin: null,
        returnsAtMin: null,
      }),
    ).toEqual([]);
  });

  it("drops a window too short to be capacity", () => {
    const weekday: DayAvailability = {
      dayOfWeek: 1,
      isHome: true,
      leavesAtMin: timeToMinutes("06:10"),
      returnsAtMin: timeToMinutes("22:55"),
    };
    expect(windowsForDate(WEEK, weekday)).toEqual([]);
  });

  it("reproduces the worked example's weekly capacity", () => {
    // Ravi: out 09:30–19:00 on weekdays, home all weekend = 4,290 minutes.
    const weekdays: DayAvailability[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      dayOfWeek: day,
      isHome: true,
      leavesAtMin: day === 0 || day === 6 ? null : timeToMinutes("09:30"),
      returnsAtMin: day === 0 || day === 6 ? null : timeToMinutes("19:00"),
    }));

    expect(weeklyCapacityMinutes(buildWeekWindows(WEEK, weekdays))).toBe(4290);
  });

  it("gives Suresh 38 percent of Ravi's capacity — and the same target", () => {
    const suresh: DayAvailability[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      dayOfWeek: day,
      isHome: day !== 6,
      leavesAtMin: day === 0 || day === 6 ? null : timeToMinutes("07:00"),
      returnsAtMin: day === 0 || day === 6 ? null : timeToMinutes("22:00"),
    }));

    const capacity = weeklyCapacityMinutes(buildWeekWindows(WEEK, suresh));
    expect(capacity).toBe(1620);

    // The rule the design is most often argued about: capacity is not an input
    // to the target. Both are present all seven days, so both owe the same.
    const targets = computeTargets(
      840,
      [
        { memberId: "ravi", presentDays: 7, carryIn: 0 },
        { memberId: "suresh", presentDays: 7, carryIn: 0 },
      ],
      50,
    );
    expect(targets[0].effectiveTarget).toBe(targets[1].effectiveTarget);
  });

  it("fits a chore only into a window long enough for it plus the buffer", () => {
    const windows = [{ kind: "evening" as const, startMin: 1140, endMin: 1380 }];
    expect(fits(windows, "evening", 60)).toBe(true);
    expect(fits(windows, "morning", 60)).toBe(false);
    expect(fits(windows, "any", 60)).toBe(true);
    expect(fits(windows, "evening", 230)).toBe(false); // 240 minus the 15 buffer
  });
});

describe("demand", () => {
  it("expands a daily template onto all seven days", () => {
    const instances = buildDemand({
      weekStart: WEEK,
      templates: [DEFAULT_TEMPLATES[0]],
    });
    expect(instances).toHaveLength(7);
    expect(new Set(instances.map((instance) => instance.choreDate)).size).toBe(7);
  });

  it("spreads a three-times-a-week chore rather than clustering it", () => {
    expect(spreadAcrossWeek(3)).toEqual([0, 2, 5]);
    expect(spreadAcrossWeek(2)).toEqual([0, 4]);
    expect(spreadAcrossWeek(1)).toEqual([0]);
  });

  it("expands a room-scoped template once per room", () => {
    const roomTemplate: ChoreTemplate = {
      ...DEFAULT_TEMPLATES[1],
      id: "t-room",
      scope: "room",
      roomId: null,
      frequency: "weekly",
    };

    const instances = buildDemand({
      weekStart: WEEK,
      templates: [roomTemplate],
      roomIds: ["r1", "r2", "r3"],
    });

    expect(instances).toHaveLength(3);
    expect(instances.map((instance) => instance.roomId).sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("is deterministic", () => {
    const first = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });
    const second = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });
    expect(first).toEqual(second);
  });

  it("counts the default workload", () => {
    const instances = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });
    // 7×30 + 7×20 + 2×25 + 3×15 = 445
    expect(totalPoints(instances)).toBe(445);
  });
});

describe("targets", () => {
  it("reproduces the worked example", () => {
    const targets = computeTargets(
      840,
      [
        { memberId: "ravi", presentDays: 7, carryIn: 60 },
        { memberId: "kumar", presentDays: 7, carryIn: 25 },
        { memberId: "suresh", presentDays: 7, carryIn: -85 },
        { memberId: "vinoth", presentDays: 7, carryIn: 0 },
        ...Array.from({ length: 4 }, (_, index) => ({
          memberId: `other${index}`,
          presentDays: 7,
          carryIn: 0,
        })),
      ],
      50,
    );

    const by = (id: string) => targets.find((target) => target.memberId === id)!;

    expect(by("ravi").baseTarget).toBe(105);
    expect(by("ravi").effectiveTarget).toBe(53); // capped at −52
    expect(by("kumar").effectiveTarget).toBe(80);
    expect(by("suresh").effectiveTarget).toBe(157); // capped at +52
    expect(by("vinoth").effectiveTarget).toBe(105);
  });

  it("reduces the target of somebody genuinely away, not somebody busy", () => {
    const targets = computeTargets(
      700,
      [
        { memberId: "here", presentDays: 7, carryIn: 0 },
        { memberId: "away", presentDays: 4, carryIn: 0 },
      ],
      50,
    );

    expect(targets[1].effectiveTarget).toBeLessThan(targets[0].effectiveTarget);
  });

  it("carries a deficit forward as a higher target next week", () => {
    const closed = closeWeek([
      { memberId: "m1", earnedPoints: 60, effectiveTarget: 105 },
      { memberId: "m2", earnedPoints: 140, effectiveTarget: 105 },
    ]);

    expect(closed[0].carryOut).toBe(-45);
    expect(closed[1].carryOut).toBe(35);

    const next = computeTargets(
      840,
      closed.map((row) => ({
        memberId: row.memberId,
        presentDays: 7,
        carryIn: row.carryOut,
      })),
      50,
    );

    expect(next[0].effectiveTarget).toBeGreaterThan(next[1].effectiveTarget);
  });
});

describe("the leaderboard", () => {
  const standing = [
    { memberId: "ravi", earnedPoints: 380, targetPoints: 340, carry: 40, choresDone: 20, choresMissed: 0 },
    { memberId: "kumar", earnedPoints: 340, targetPoints: 328, carry: 12, choresDone: 18, choresMissed: 1 },
    { memberId: "vinoth", earnedPoints: 280, targetPoints: 288, carry: -8, choresDone: 15, choresMissed: 2 },
    { memberId: "suresh", earnedPoints: 95, targetPoints: 380, carry: -285, choresDone: 5, choresMissed: 12 },
  ];

  it("ranks by points earned", () => {
    expect(rankStanding(standing).map((row) => row.memberId)).toEqual([
      "ravi",
      "kumar",
      "vinoth",
      "suresh",
    ]);
  });

  it("computes the headline metric the whole product is judged on", () => {
    // Top three of 1,095 points: 1,000. If this falls month over month, the
    // product is working.
    expect(concentrationRatio(standing)).toBeCloseTo(1000 / 1095, 5);
  });

  it("reports zero concentration when nothing has been done", () => {
    expect(concentrationRatio([])).toBe(0);
  });
});

describe("the solver", () => {
  it("assigns every instance or marks it open — nothing is dropped", () => {
    const roster = members(8);
    const instances = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });
    const targets = new Map(
      computeTargets(
        totalPoints(instances),
        roster.map((member) => ({ memberId: member.memberId, presentDays: 7, carryIn: 0 })),
        50,
      ).map((target) => [target.memberId, target.effectiveTarget]),
    );

    const result = solve({
      instances,
      members: roster,
      windowsByMember: alwaysHome(roster),
      targets,
    });

    expect(result.assignments).toHaveLength(instances.length);
    expect(new Set(result.assignments.map((a) => a.instanceId)).size).toBe(instances.length);
  });

  it("never gives a cooking chore to somebody who cannot cook (HC-3)", () => {
    const roster = members(8);
    const instances = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });
    const windows = alwaysHome(roster);

    const result = solve({
      instances,
      members: roster,
      windowsByMember: windows,
      targets: new Map(roster.map((member) => [member.memberId, 100])),
    });

    const canCook = new Map(roster.map((member) => [member.memberId, member.canCook]));
    for (const assignment of result.assignments) {
      if (!assignment.memberId) continue;
      const instance = instances.find((i) => i.id === assignment.instanceId)!;
      if (instance.requiresCookingSkill) {
        expect(canCook.get(assignment.memberId)).toBe(true);
      }
    }
  });

  it("leaves a chore open rather than assigning it to somebody ineligible", () => {
    // Nobody in this house can cook.
    const roster = members(4, { canCook: false });
    const instances = buildDemand({
      weekStart: WEEK,
      templates: [DEFAULT_TEMPLATES[0]],
    });

    const result = solve({
      instances,
      members: roster,
      windowsByMember: alwaysHome(roster),
      targets: new Map(roster.map((member) => [member.memberId, 100])),
    });

    expect(result.openInstanceIds).toHaveLength(instances.length);
    expect(result.assignments.every((assignment) => assignment.memberId === null)).toBe(true);
  });

  it("spreads the load close to target", () => {
    const roster = members(8, { canCook: true });
    const instances = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });
    const targets = new Map(
      computeTargets(
        totalPoints(instances),
        roster.map((member) => ({ memberId: member.memberId, presentDays: 7, carryIn: 0 })),
        50,
      ).map((target) => [target.memberId, target.effectiveTarget]),
    );

    const result = solve({
      instances,
      members: roster,
      windowsByMember: alwaysHome(roster),
      targets,
    });

    // Everybody should end within one substantial chore of their target.
    expect(result.maxDeviation).toBeLessThanOrEqual(30);
  });

  it("generates 30 members and 200 instances in under five seconds (NFR-03)", () => {
    const roster = members(30, { canCook: true });
    const heavyTemplates: ChoreTemplate[] = Array.from({ length: 30 }, (_, index) => ({
      ...DEFAULT_TEMPLATES[1],
      id: `t${index}`,
      name: `Chore ${index}`,
      frequency: "daily",
    }));

    const instances = buildDemand({ weekStart: WEEK, templates: heavyTemplates });
    expect(instances.length).toBeGreaterThanOrEqual(200);

    const started = Date.now();
    const result = solve({
      instances,
      members: roster,
      windowsByMember: alwaysHome(roster),
      targets: new Map(roster.map((member) => [member.memberId, 200])),
      maxLocalSearchPasses: 5,
    });
    const elapsed = Date.now() - started;

    expect(result.assignments).toHaveLength(instances.length);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe("the property that must hold", () => {
  it("never violates a hard constraint, for any availability configuration", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.array(
          fc.record({
            isHome: fc.boolean(),
            leaves: fc.integer({ min: 6, max: 12 }),
            returns: fc.integer({ min: 13, max: 23 }),
          }),
          { minLength: 7, maxLength: 7 },
        ),
        fc.boolean(),
        (memberCount, pattern, someoneCooks) => {
          const roster = members(memberCount).map((member, index) => ({
            ...member,
            canCook: someoneCooks ? index % 2 === 0 : false,
          }));

          // Every member gets the same randomly generated week, with one member
          // shifted so the configurations differ between them.
          const windowsByMember = new Map(
            roster.map((member, memberIndex) => {
              const weekdays: DayAvailability[] = pattern.map((day, dayIndex) => ({
                dayOfWeek: dayIndex,
                isHome: day.isHome,
                leavesAtMin: (day.leaves + (memberIndex % 3)) * 60,
                returnsAtMin: (day.returns - (memberIndex % 2)) * 60,
              }));
              return [member.memberId, buildWeekWindows(WEEK, weekdays)];
            }),
          );

          const instances = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });

          const result = solve({
            instances,
            members: roster,
            windowsByMember,
            targets: new Map(roster.map((member) => [member.memberId, 100])),
            maxLocalSearchPasses: 3,
          });

          const validation = validateSchedule({
            instances,
            members: roster,
            windowsByMember,
            assignments: result.assignments,
          });

          // Open instances are a legitimate outcome; violations are not.
          expect(validation.violations).toEqual([]);
          expect(validation.missing).toEqual([]);
          expect(validation.duplicated).toEqual([]);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("assigns or opens every instance, never drops one", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 4 }),
        (memberCount, templateCount) => {
          const roster = members(memberCount);
          const instances = buildDemand({
            weekStart: WEEK,
            templates: DEFAULT_TEMPLATES.slice(0, templateCount),
          });

          const result = solve({
            instances,
            members: roster,
            windowsByMember: alwaysHome(roster),
            targets: new Map(roster.map((member) => [member.memberId, 80])),
            maxLocalSearchPasses: 3,
          });

          const accounted = new Set(result.assignments.map((a) => a.instanceId));
          expect(accounted.size).toBe(instances.length);

          const openCount = result.assignments.filter((a) => a.memberId === null).length;
          expect(openCount).toBe(result.openInstanceIds.length);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("respects the daily ceiling however far behind somebody is (HC-6)", () => {
    // One member, a full week of daily chores: the ceiling has to bite.
    const roster = members(1, { canCook: true });
    const instances = buildDemand({ weekStart: WEEK, templates: DEFAULT_TEMPLATES });

    const result = solve({
      instances,
      members: roster,
      windowsByMember: alwaysHome(roster),
      targets: new Map([[roster[0].memberId, 9999]]),
    });

    const perDay = new Map<string, number>();
    for (const assignment of result.assignments) {
      if (!assignment.memberId) continue;
      const instance = instances.find((i) => i.id === assignment.instanceId)!;
      perDay.set(instance.choreDate, (perDay.get(instance.choreDate) ?? 0) + 1);
    }

    for (const count of perDay.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});

describe("presence", () => {
  it("counts only the days a weekday-only member is resident", () => {
    const member = members(1, { residency: "weekday_only" })[0];
    expect(presentDays(member, WEEK)).toBe(5);
  });

  it("removes away days from the count", () => {
    const member = members(1)[0];
    expect(
      presentDays(member, WEEK, [
        { date: weekDates(WEEK)[0], type: "away", leavesAtMin: null, returnsAtMin: null },
        { date: weekDates(WEEK)[1], type: "away", leavesAtMin: null, returnsAtMin: null },
      ]),
    ).toBe(5);
  });
});
