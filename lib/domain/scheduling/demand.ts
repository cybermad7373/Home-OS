import { weekDates } from "./capacity";
import type { ChoreInstance, ChoreTemplate } from "./types";

/**
 * Demand — docs/06-ALGORITHMS.md section 2.3.
 *
 * Expanding templates into dated instances. Deterministic: the same templates
 * and the same week always produce the same instances, in the same order, so
 * two people looking at the same schedule see the same thing.
 */

/**
 * Spreads n occurrences as evenly as possible across seven days.
 *
 * Three a week lands on Monday, Wednesday and Friday rather than three days in
 * a row — clustering is how a "three times a week" chore becomes one person's
 * bad Tuesday.
 */
export function spreadAcrossWeek(count: number): number[] {
  if (count <= 0) return [];
  if (count >= 7) return [0, 1, 2, 3, 4, 5, 6].slice(0, count);

  const days: number[] = [];
  for (let index = 0; index < count; index += 1) {
    days.push(Math.round((index * 7) / count));
  }
  return days;
}

export interface DemandGuest {
  guestId: string;
  hostMemberId: string;
  /** Inclusive. Only the nights inside the week generate work. */
  fromDate: string;
  toDate: string;
  isAssignable: boolean;
}

export interface DemandInput {
  weekStart: string;
  templates: ChoreTemplate[];
  /** Rooms that exist this week, for room-scoped templates. */
  roomIds?: string[];
  /** Guests staying during the week, and how many members share the house. */
  guests?: DemandGuest[];
  memberCount?: number;
}

/**
 * Every instance the week needs.
 *
 * A room-scoped template expands once per room, and each instance is eligible
 * only to that room's occupants (HC-2).
 */
export function buildDemand(input: DemandInput): ChoreInstance[] {
  const dates = weekDates(input.weekStart);
  const instances: ChoreInstance[] = [];

  const push = (
    template: ChoreTemplate,
    date: string,
    occurrence: number,
    roomId: string | null,
  ) => {
    instances.push({
      id: `${template.id}:${date}:${occurrence}${roomId ? `:${roomId}` : ""}`,
      templateId: template.id,
      name: template.name,
      choreDate: date,
      slot: template.slot,
      effortPoints: template.effortPoints,
      durationMin: template.durationMin,
      scope: template.scope,
      roomId,
      requiresCookingSkill: template.requiresCookingSkill,
      isHeavy: template.isHeavy,
    });
  };

  for (const template of input.templates) {
    // A room-scoped template produces one instance per room; a house-scoped one
    // produces a single instance with no room attached.
    const targets =
      template.scope === "room"
        ? (template.roomId ? [template.roomId] : (input.roomIds ?? []))
        : [null];

    for (const roomId of targets) {
      switch (template.frequency) {
        case "daily":
          dates.forEach((date, index) => push(template, date, index, roomId));
          break;

        case "weekly":
          // Placed midweek: a weekly chore on Monday collides with everything
          // else that resets on Monday.
          push(template, dates[2], 0, roomId);
          break;

        case "times_per_week": {
          const count = Math.min(7, Math.max(1, template.timesPerWeek ?? 1));
          spreadAcrossWeek(count).forEach((dayIndex, occurrence) =>
            push(template, dates[dayIndex], occurrence, roomId),
          );
          break;
        }
      }
    }
  }

  instances.push(
    ...guestDemand({
      instances,
      dates,
      guests: input.guests ?? [],
      memberCount: input.memberCount ?? 0,
    }),
  );

  // Sorted so that a run is reproducible regardless of the order the templates
  // came back from the database in.
  return instances.sort((a, b) =>
    a.choreDate === b.choreDate ? a.id.localeCompare(b.id) : a.choreDate.localeCompare(b.choreDate),
  );
}

/**
 * The extra work a guest creates — docs/06-ALGORITHMS.md section 2.3.
 *
 * An extra person in the house for a day is an extra person's worth of mess.
 * Each assignable guest present on a date adds their proportional share of that
 * day's common workload: with eight members, one guest adds an eighth of the
 * day's house-scoped points, as real instances eligible only to their host.
 *
 * Three deliberate exclusions. Room-scoped chores are not duplicated, because a
 * visitor does not create a second bedroom to clean. Skilled chores are not,
 * because a guest's presence does not create a second dinner that somebody must
 * be qualified to cook — it makes the existing one bigger, which the expense
 * split already charges for. And a guest marked unassignable produces nothing:
 * an elderly relative or a small child is a head in the expense count and not a
 * source of chores, and pretending otherwise would make hosts stop registering
 * them at all.
 *
 * Instances are taken cheapest-first up to the share, and at least one is
 * always taken. That rounds up, sometimes sharply: with eight members a guest's
 * share of a 35-point day is 4.4 points, and the cheapest job in the house is
 * 15. The alternative is rounding to nearest, which for any normal house gives
 * zero — a guest who creates no work at all, which is the outcome the
 * mechanism exists to prevent. The granularity of a chore is the smallest unit
 * the house has, so a visitor costs their host one job.
 */
function guestDemand(input: {
  instances: ChoreInstance[];
  dates: string[];
  guests: DemandGuest[];
  memberCount: number;
}): ChoreInstance[] {
  const assignable = input.guests.filter((guest) => guest.isAssignable);
  if (assignable.length === 0 || input.memberCount <= 0) return [];

  const extra: ChoreInstance[] = [];

  for (const date of input.dates) {
    // Only what a visitor plausibly adds to: shared space, no skill gate.
    const common = input.instances
      .filter(
        (instance) =>
          instance.choreDate === date &&
          instance.scope === "house" &&
          !instance.requiresCookingSkill &&
          !instance.guestId,
      )
      .sort((a, b) =>
        a.effortPoints === b.effortPoints
          ? a.id.localeCompare(b.id)
          : a.effortPoints - b.effortPoints,
      );

    if (common.length === 0) continue;

    const dayPoints = common.reduce((sum, instance) => sum + instance.effortPoints, 0);
    const share = dayPoints / input.memberCount;

    for (const guest of assignable) {
      if (guest.fromDate > date || date > guest.toDate) continue;

      let taken = 0;
      for (const instance of common) {
        if (taken >= share) break;
        extra.push({
          ...instance,
          id: `${instance.id}:guest:${guest.guestId}`,
          guestId: guest.guestId,
          hostMemberId: guest.hostMemberId,
        });
        taken += instance.effortPoints;
      }
    }
  }

  return extra;
}

export function totalPoints(instances: ChoreInstance[]): number {
  return instances.reduce((sum, instance) => sum + instance.effortPoints, 0);
}

/**
 * The figure the admin is shown when editing templates: "this adds 210 points
 * per week to the house. Each member's weekly target becomes 105."
 */
export function weeklyLoadSummary(
  templates: ChoreTemplate[],
  weekStart: string,
  memberCount: number,
  roomIds: string[] = [],
): { totalPoints: number; instanceCount: number; targetPerMember: number } {
  const instances = buildDemand({ weekStart, templates, roomIds });
  const points = totalPoints(instances);

  return {
    totalPoints: points,
    instanceCount: instances.length,
    targetPerMember: memberCount > 0 ? Math.round(points / memberCount) : 0,
  };
}
