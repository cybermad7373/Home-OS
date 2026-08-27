import { fits, residencyCoversDate } from "./capacity";
import {
  MAX_INSTANCES_PER_DAY,
  MAX_MINUTES_PER_DAY,
  type ChoreInstance,
  type SchedulingMember,
  type WeekWindows,
} from "./types";

/**
 * Hard constraints — docs/06-ALGORITHMS.md section 2.5.
 *
 * There are no soft exceptions here. A violation invalidates the assignment,
 * full stop. This is the file that makes the fairness claim checkable: the
 * solver proposes, and an LLM may propose, but nothing is published that does
 * not pass every one of these.
 */

export type ConstraintCode =
  | "HC-1" // availability
  | "HC-2" // room scope
  | "HC-3" // cooking skill
  | "HC-4" // presence and residency
  | "HC-5" // no double-booking
  | "HC-6" // daily ceiling
  | "HC-7" // guest eligibility
  | "HC-8"; // active membership

export interface ConstraintViolation {
  code: ConstraintCode;
  instanceId: string;
  memberId: string;
  detail: string;
}

/** What a member already holds, so overlap and ceilings can be checked. */
export interface MemberLoad {
  /** date -> instances already assigned to this member that day. */
  byDate: Map<string, ChoreInstance[]>;
}

export function emptyLoad(): MemberLoad {
  return { byDate: new Map() };
}

export function addToLoad(load: MemberLoad, instance: ChoreInstance): void {
  const list = load.byDate.get(instance.choreDate) ?? [];
  list.push(instance);
  load.byDate.set(instance.choreDate, list);
}

export function removeFromLoad(load: MemberLoad, instance: ChoreInstance): void {
  const list = load.byDate.get(instance.choreDate) ?? [];
  const index = list.findIndex((held) => held.id === instance.id);
  if (index >= 0) list.splice(index, 1);
  load.byDate.set(instance.choreDate, list);
}

export interface CheckInput {
  instance: ChoreInstance;
  member: SchedulingMember;
  windows: WeekWindows;
  load: MemberLoad;
  /** Room occupancy on the instance's date, if the house tracks it per date. */
  roomOccupancy?: Map<string, string[]>;
}

/**
 * Every violation, not just the first.
 *
 * Returning all of them matters for the LLM overlay: when a proposal is
 * rejected, the log records exactly which constraints it broke, which is the
 * difference between a useful rejection record and "it didn't work".
 */
export function checkHardConstraints(input: CheckInput): ConstraintViolation[] {
  const { instance, member, windows, load } = input;
  const violations: ConstraintViolation[] = [];

  const fail = (code: ConstraintCode, detail: string) =>
    violations.push({ code, instanceId: instance.id, memberId: member.memberId, detail });

  // HC-8 — an active member on that date.
  if (member.joinedDate > instance.choreDate) {
    fail("HC-8", "not a member yet on that date");
  }
  if (member.leftDate !== null && member.leftDate < instance.choreDate) {
    fail("HC-8", "had already left by that date");
  }

  // HC-4 — presence and residency. An away exception removes the day's windows
  // entirely, so HC-1 catches it too; this names the reason.
  if (!residencyCoversDate(member, instance.choreDate)) {
    fail("HC-4", "their residency does not cover that day");
  }

  // HC-1 — a window long enough, in the right part of the day.
  const dayWindows = windows.get(instance.choreDate) ?? [];
  if (!fits(dayWindows, instance.slot, instance.durationMin)) {
    fail("HC-1", `not home long enough on ${instance.choreDate} for a ${instance.slot} chore`);
  }

  // HC-2 — a room chore belongs to that room's occupants.
  if (instance.scope === "room" && instance.roomId) {
    const occupants = input.roomOccupancy?.get(instance.roomId);
    const occupies = occupants
      ? occupants.includes(member.memberId)
      : member.roomId === instance.roomId;
    if (!occupies) fail("HC-2", "does not live in that room");
  }

  // HC-3 — cooking is a skill, not a rota slot. Somebody who cannot cook a meal
  // owes the same points through other work.
  if (instance.requiresCookingSkill && !member.canCook) {
    fail("HC-3", "does not cook");
  }

  const sameDay = load.byDate.get(instance.choreDate) ?? [];

  // HC-6 — the daily ceiling. However far behind somebody is, a day has limits.
  if (sameDay.length >= MAX_INSTANCES_PER_DAY) {
    fail("HC-6", `already has ${sameDay.length} chores that day`);
  }
  const minutesThatDay = sameDay.reduce((sum, held) => sum + held.durationMin, 0);
  if (minutesThatDay + instance.durationMin > MAX_MINUTES_PER_DAY) {
    fail("HC-6", `would exceed ${MAX_MINUTES_PER_DAY} minutes that day`);
  }

  // HC-5 — no double-booking. Two chores in the same slot on the same day
  // cannot both be done, whatever the totals say.
  const clash = sameDay.some(
    (held) =>
      held.slot === instance.slot && held.slot !== "any" && instance.slot !== "any",
  );
  if (clash) {
    fail("HC-5", `already has a ${instance.slot} chore that day`);
  }

  // HC-7 — a guest's work belongs to their host and to nobody else. Spreading
  // it across the house would make hosting free, which is the behaviour the
  // guest mechanism exists to price.
  if (instance.guestId && instance.hostMemberId !== member.memberId) {
    fail("HC-7", "is not the host of that guest");
  }

  return violations;
}

export function satisfiesHardConstraints(input: CheckInput): boolean {
  return checkHardConstraints(input).length === 0;
}

/**
 * Validates a whole proposed schedule — the gate every published week passes
 * through, whether a solver or a model produced it.
 *
 * Two things are checked beyond the per-assignment constraints, and both are
 * about the schedule as a whole:
 *
 *   - every instance appears exactly once. Nothing silently dropped, nothing
 *     assigned twice.
 *   - the load is rebuilt from scratch as the proposal is walked, so HC-5 and
 *     HC-6 are judged against the proposal itself rather than against whatever
 *     the caller happened to pass in.
 */
export function validateSchedule(input: {
  instances: ChoreInstance[];
  members: SchedulingMember[];
  windowsByMember: Map<string, WeekWindows>;
  assignments: { instanceId: string; memberId: string | null }[];
  roomOccupancy?: Map<string, string[]>;
}): { valid: boolean; violations: ConstraintViolation[]; missing: string[]; duplicated: string[] } {
  const instanceById = new Map(input.instances.map((instance) => [instance.id, instance]));
  const memberById = new Map(input.members.map((member) => [member.memberId, member]));

  const seen = new Map<string, number>();
  for (const assignment of input.assignments) {
    seen.set(assignment.instanceId, (seen.get(assignment.instanceId) ?? 0) + 1);
  }

  const missing = input.instances
    .filter((instance) => !seen.has(instance.id))
    .map((instance) => instance.id);
  const duplicated = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([instanceId]) => instanceId);

  const loads = new Map<string, MemberLoad>();
  const violations: ConstraintViolation[] = [];

  for (const assignment of input.assignments) {
    // An open instance is a legitimate outcome, not a violation: better an
    // honestly unassigned chore than one assigned to somebody who cannot do it.
    if (assignment.memberId === null) continue;

    const instance = instanceById.get(assignment.instanceId);
    const member = memberById.get(assignment.memberId);
    if (!instance || !member) {
      violations.push({
        code: "HC-8",
        instanceId: assignment.instanceId,
        memberId: assignment.memberId,
        detail: "unknown instance or member",
      });
      continue;
    }

    const load = loads.get(member.memberId) ?? emptyLoad();
    loads.set(member.memberId, load);

    violations.push(
      ...checkHardConstraints({
        instance,
        member,
        windows: input.windowsByMember.get(member.memberId) ?? new Map(),
        load,
        roomOccupancy: input.roomOccupancy,
      }),
    );

    addToLoad(load, instance);
  }

  return {
    valid: violations.length === 0 && missing.length === 0 && duplicated.length === 0,
    violations,
    missing,
    duplicated,
  };
}
