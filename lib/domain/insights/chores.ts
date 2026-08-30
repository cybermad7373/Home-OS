/**
 * Chore insights (IN-03).
 *
 * How much work was scheduled, how much of it actually happened, and how
 * evenly it fell. Pure: assignments in, report out.
 *
 * The status vocabulary is the database's own (`assignment_status`), and the
 * three groupings below are the ones the rest of the app already uses:
 *
 *   * **confirmed** — done, and somebody else agreed it was done. The only
 *     status that earns points anywhere in HouseOS.
 *   * **pending** — assigned, open, or waiting on a confirmation. Still live.
 *   * **missed** — the deadline passed, or a confirmer rejected it.
 *
 * `cancelled` is in neither half. A chore called off is not work somebody
 * failed to do, and counting it as missed would punish a house for adapting
 * (the same rule the Calendar's completion rate follows).
 */

import { bucketKeyOf, bucketsBetween } from "./buckets";
import type {
  ChoreAssignment,
  ChoreInsightsInput,
  ChoreInsightsOutput,
  MemberWorkload,
  WorkloadBucket,
} from "./types";

function isMissed(status: ChoreAssignment["status"]): boolean {
  return status === "missed" || status === "rejected";
}

function isPending(status: ChoreAssignment["status"]): boolean {
  return status === "assigned" || status === "open" || status === "done_pending";
}

/** Everything except a cancellation, which the house decided not to do. */
function counts(status: ChoreAssignment["status"]): boolean {
  return status !== "cancelled";
}

export function buildChoreInsights(input: ChoreInsightsInput): ChoreInsightsOutput {
  const { range, members, memberFilter, isFamily } = input;

  const selected = input.assignments.filter((assignment) => {
    if (assignment.choreDate < range.from || assignment.choreDate > range.to) return false;
    if (!counts(assignment.status)) return false;
    if (memberFilter && assignment.memberId !== memberFilter) return false;
    return true;
  });

  const bucketKeys = bucketsBetween(range.from, range.to, range.granularity);
  const bucketIndex = new Map(bucketKeys.map((key, index) => [key, index]));
  const buckets: WorkloadBucket[] = bucketKeys.map((key) => ({
    key,
    assignedPoints: 0,
    confirmedPoints: 0,
    missedPoints: 0,
  }));

  // Every active member gets a row, including one who did nothing. A zero is a
  // fact about the week, and leaving it out is how an unbalanced house looks
  // balanced.
  const byMember = new Map<string, MemberWorkload>();
  for (const member of members) {
    if (!member.active) continue;
    if (memberFilter && member.memberId !== memberFilter) continue;
    byMember.set(member.memberId, blankWorkload(member.memberId, member.displayName));
  }

  for (const assignment of selected) {
    const points = Math.max(0, assignment.points);
    const index = bucketIndex.get(bucketKeyOf(assignment.choreDate, range.granularity));

    if (index !== undefined) {
      buckets[index].assignedPoints += points;
      if (assignment.status === "confirmed") buckets[index].confirmedPoints += points;
      if (isMissed(assignment.status)) buckets[index].missedPoints += points;
    }

    // An unclaimed chore from the marketplace has no assignee. It still counts
    // towards what the house scheduled — the bucket above has it — but there is
    // nobody to attribute it to.
    if (!assignment.memberId) continue;

    let workload = byMember.get(assignment.memberId);
    if (!workload) {
      workload = blankWorkload(assignment.memberId, assignment.memberName);
      byMember.set(assignment.memberId, workload);
    }

    workload.assignedPoints += points;
    if (assignment.status === "confirmed") workload.confirmedPoints += points;
    else if (isPending(assignment.status)) workload.pendingPoints += points;
    else if (isMissed(assignment.status)) workload.missedPoints += points;
  }

  const rows = [...byMember.values()].map((workload) => ({
    ...workload,
    completionRate:
      workload.assignedPoints === 0 ? null : workload.confirmedPoints / workload.assignedPoints,
  }));

  // A family Home reads this as contribution, not as a league table (BR-260),
  // so it is ordered by name rather than by who did most.
  rows.sort((a, b) =>
    isFamily
      ? a.memberName.localeCompare(b.memberName)
      : b.confirmedPoints - a.confirmedPoints || a.memberName.localeCompare(b.memberName),
  );

  const assignedPoints = sum(rows, "assignedPoints") + unassignedPoints(selected);
  const confirmedPoints = buckets.reduce((total, bucket) => total + bucket.confirmedPoints, 0);
  const missedPoints = buckets.reduce((total, bucket) => total + bucket.missedPoints, 0);

  return {
    range,
    buckets,
    byMember: rows,
    ranked: !isFamily,
    summary: {
      assignedPoints,
      confirmedPoints,
      pendingPoints: sum(rows, "pendingPoints"),
      missedPoints,
      completionRate: assignedPoints === 0 ? null : confirmedPoints / assignedPoints,
      topThreeShare: isFamily ? null : topThreeShare(rows),
    },
  };
}

function blankWorkload(memberId: string, memberName: string): MemberWorkload {
  return {
    memberId,
    memberName,
    assignedPoints: 0,
    confirmedPoints: 0,
    pendingPoints: 0,
    missedPoints: 0,
    completionRate: null,
  };
}

function sum(rows: MemberWorkload[], key: keyof MemberWorkload): number {
  return rows.reduce((total, row) => total + (row[key] as number), 0);
}

/** Points on chores nobody had claimed — real work, attributable to no one. */
function unassignedPoints(assignments: ChoreAssignment[]): number {
  return assignments
    .filter((assignment) => assignment.memberId === null)
    .reduce((total, assignment) => total + Math.max(0, assignment.points), 0);
}

/**
 * The BRD's headline metric: the share of confirmed effort earned by the three
 * people who did most. `null` until somebody has earned something, because a
 * house with no confirmed work is not a concentrated one.
 */
function topThreeShare(rows: MemberWorkload[]): number | null {
  const points = rows.map((row) => row.confirmedPoints).sort((a, b) => b - a);
  const total = points.reduce((sum, value) => sum + value, 0);
  if (total === 0) return null;
  return points.slice(0, 3).reduce((sum, value) => sum + value, 0) / total;
}
