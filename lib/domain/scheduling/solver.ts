import {
  addToLoad,
  emptyLoad,
  removeFromLoad,
  satisfiesHardConstraints,
  type MemberLoad,
} from "./constraints";
import { weeklyCapacityMinutes } from "./capacity";
import type {
  Assignment,
  ChoreInstance,
  SchedulingMember,
  SolveResult,
  WeekWindows,
} from "./types";

/**
 * The solver — docs/06-ALGORITHMS.md section 2.7.
 *
 * Greedy construction, then local search. Not optimal, and it does not need to
 * be: it needs to be feasible, fair within a few points, and fast enough that
 * generating a week for thirty members finishes in well under the five seconds
 * NFR-03 allows.
 *
 * What it must never do is produce an assignment that violates a hard
 * constraint. An unfair schedule is an argument; an infeasible one — somebody
 * assigned a morning chore when they leave at seven — destroys trust in the
 * whole product, and one such incident costs more than every schedule this
 * could optimise.
 */

export interface SolveInput {
  instances: ChoreInstance[];
  members: SchedulingMember[];
  windowsByMember: Map<string, WeekWindows>;
  /** memberId -> points they owe this week. */
  targets: Map<string, number>;
  /** Heavy templates each member did last week, for SO-2. */
  heavyHistory?: Map<string, Set<string>>;
  roomOccupancy?: Map<string, string[]>;
  maxLocalSearchPasses?: number;
}

interface Candidate {
  member: SchedulingMember;
  remaining: number;
  heavyPenalty: number;
  clusterPenalty: number;
  varietyPenalty: number;
  capacityLeft: number;
}

export function solve(input: SolveInput): SolveResult {
  const loads = new Map<string, MemberLoad>(
    input.members.map((member) => [member.memberId, emptyLoad()]),
  );
  const points = new Map<string, number>(
    input.members.map((member) => [member.memberId, 0]),
  );
  const templatesTaken = new Map<string, Map<string, number>>(
    input.members.map((member) => [member.memberId, new Map()]),
  );
  const capacity = new Map<string, number>(
    input.members.map((member) => [
      member.memberId,
      weeklyCapacityMinutes(input.windowsByMember.get(member.memberId) ?? new Map()),
    ]),
  );

  const eligibleByInstance = new Map<string, SchedulingMember[]>();
  for (const instance of input.instances) {
    eligibleByInstance.set(
      instance.id,
      input.members.filter((member) =>
        satisfiesHardConstraints({
          instance,
          member,
          windows: input.windowsByMember.get(member.memberId) ?? new Map(),
          load: emptyLoad(), // eligibility before anything is assigned
          roomOccupancy: input.roomOccupancy,
        }),
      ),
    );
  }

  // Most-constrained first: the chore only two people can do is placed before
  // the one anybody could take, or those two will already be full.
  const ordered = [...input.instances].sort((a, b) => {
    const aCount = eligibleByInstance.get(a.id)?.length ?? 0;
    const bCount = eligibleByInstance.get(b.id)?.length ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    if (b.effortPoints !== a.effortPoints) return b.effortPoints - a.effortPoints;
    return a.id.localeCompare(b.id);
  });

  const assignments = new Map<string, string | null>();
  const openInstanceIds: string[] = [];

  for (const instance of ordered) {
    const candidates: Candidate[] = [];

    for (const member of eligibleByInstance.get(instance.id) ?? []) {
      const load = loads.get(member.memberId)!;

      // Re-checked against the load as it stands now: eligibility was computed
      // on an empty schedule, and HC-5 and HC-6 depend on what they already hold.
      if (
        !satisfiesHardConstraints({
          instance,
          member,
          windows: input.windowsByMember.get(member.memberId) ?? new Map(),
          load,
          roomOccupancy: input.roomOccupancy,
        })
      ) {
        continue;
      }

      const target = input.targets.get(member.memberId) ?? 0;
      const taken = templatesTaken.get(member.memberId)!;

      candidates.push({
        member,
        remaining: target - (points.get(member.memberId) ?? 0),
        // SO-2 — the worst job should not land on the same person twice running.
        heavyPenalty:
          instance.isHeavy &&
          input.heavyHistory?.get(member.memberId)?.has(instance.templateId)
            ? 1
            : 0,
        // SO-3 — spread across the week rather than clustered on one day.
        clusterPenalty: (load.byDate.get(instance.choreDate) ?? []).length,
        // SO-4 — variety: not the same chore five times.
        varietyPenalty: taken.get(instance.templateId) ?? 0,
        capacityLeft: capacity.get(member.memberId) ?? 0,
      });
    }

    if (candidates.length === 0) {
      // Nobody can legally take it. It goes to the pool and the admin is told —
      // generation never aborts wholesale, and nothing is silently dropped.
      assignments.set(instance.id, null);
      openInstanceIds.push(instance.id);
      continue;
    }

    candidates.sort(compareCandidates);
    const chosen = candidates[0].member;

    assignments.set(instance.id, chosen.memberId);
    addToLoad(loads.get(chosen.memberId)!, instance);
    points.set(chosen.memberId, (points.get(chosen.memberId) ?? 0) + instance.effortPoints);
    capacity.set(
      chosen.memberId,
      (capacity.get(chosen.memberId) ?? 0) - instance.durationMin,
    );
    const taken = templatesTaken.get(chosen.memberId)!;
    taken.set(instance.templateId, (taken.get(instance.templateId) ?? 0) + 1);
  }

  localSearch({
    input,
    assignments,
    loads,
    points,
    passes: input.maxLocalSearchPasses ?? 200,
  });

  const result: Assignment[] = input.instances.map((instance) => ({
    instanceId: instance.id,
    memberId: assignments.get(instance.id) ?? null,
  }));

  return {
    assignments: result,
    openInstanceIds,
    pointsByMember: points,
    maxDeviation: maxDeviation(points, input.targets),
  };
}

function compareCandidates(a: Candidate, b: Candidate): number {
  // Furthest below target first. This is SO-1, and it is what makes the
  // schedule converge on fairness rather than on convenience.
  if (b.remaining !== a.remaining) return b.remaining - a.remaining;
  if (a.heavyPenalty !== b.heavyPenalty) return a.heavyPenalty - b.heavyPenalty;
  if (a.clusterPenalty !== b.clusterPenalty) return a.clusterPenalty - b.clusterPenalty;
  if (a.varietyPenalty !== b.varietyPenalty) return a.varietyPenalty - b.varietyPenalty;
  if (b.capacityLeft !== a.capacityLeft) return b.capacityLeft - a.capacityLeft;
  return a.member.memberId.localeCompare(b.member.memberId);
}

/** Σ (assigned − target)², the objective the swaps try to reduce (SO-1). */
function objective(points: Map<string, number>, targets: Map<string, number>): number {
  let total = 0;
  for (const [memberId, target] of targets) {
    const deviation = (points.get(memberId) ?? 0) - target;
    total += deviation * deviation;
  }
  return total;
}

function maxDeviation(points: Map<string, number>, targets: Map<string, number>): number {
  let worst = 0;
  for (const [memberId, target] of targets) {
    worst = Math.max(worst, Math.abs((points.get(memberId) ?? 0) - target));
  }
  return worst;
}

/**
 * Pairwise swaps that reduce the objective without breaking a constraint.
 *
 * Capped, because this runs on a schedule and a solver that occasionally takes
 * a minute is a solver that occasionally does not run at all.
 */
function localSearch(args: {
  input: SolveInput;
  assignments: Map<string, string | null>;
  loads: Map<string, MemberLoad>;
  points: Map<string, number>;
  passes: number;
}): void {
  const { input, assignments, loads, points } = args;
  const memberById = new Map(input.members.map((member) => [member.memberId, member]));

  const assigned = input.instances.filter(
    (instance) => assignments.get(instance.id) !== null,
  );

  for (let pass = 0; pass < args.passes; pass += 1) {
    let improved = false;

    for (let i = 0; i < assigned.length; i += 1) {
      for (let j = i + 1; j < assigned.length; j += 1) {
        const first = assigned[i];
        const second = assigned[j];
        const firstMemberId = assignments.get(first.id);
        const secondMemberId = assignments.get(second.id);

        if (!firstMemberId || !secondMemberId || firstMemberId === secondMemberId) continue;

        const before = objective(points, input.targets);

        const firstMember = memberById.get(firstMemberId)!;
        const secondMember = memberById.get(secondMemberId)!;
        const firstLoad = loads.get(firstMemberId)!;
        const secondLoad = loads.get(secondMemberId)!;

        // Take both off, so each is judged against the state it would land in.
        removeFromLoad(firstLoad, first);
        removeFromLoad(secondLoad, second);

        const legal =
          satisfiesHardConstraints({
            instance: second,
            member: firstMember,
            windows: input.windowsByMember.get(firstMemberId) ?? new Map(),
            load: firstLoad,
            roomOccupancy: input.roomOccupancy,
          }) &&
          satisfiesHardConstraints({
            instance: first,
            member: secondMember,
            windows: input.windowsByMember.get(secondMemberId) ?? new Map(),
            load: secondLoad,
            roomOccupancy: input.roomOccupancy,
          });

        if (!legal) {
          addToLoad(firstLoad, first);
          addToLoad(secondLoad, second);
          continue;
        }

        const delta = second.effortPoints - first.effortPoints;
        points.set(firstMemberId, (points.get(firstMemberId) ?? 0) + delta);
        points.set(secondMemberId, (points.get(secondMemberId) ?? 0) - delta);

        if (objective(points, input.targets) < before) {
          assignments.set(first.id, secondMemberId);
          assignments.set(second.id, firstMemberId);
          addToLoad(firstLoad, second);
          addToLoad(secondLoad, first);
          improved = true;
        } else {
          points.set(firstMemberId, (points.get(firstMemberId) ?? 0) - delta);
          points.set(secondMemberId, (points.get(secondMemberId) ?? 0) + delta);
          addToLoad(firstLoad, first);
          addToLoad(secondLoad, second);
        }
      }
    }

    if (!improved) break;
  }
}
