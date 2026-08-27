/**
 * Targets — docs/06-ALGORITHMS.md section 2.4.
 *
 * How many points each member owes this week. The one line that matters:
 *
 *   **Availability is not an input here.** Presence is — an away day genuinely
 *   removes you from the house — but being busy is not. A member who leaves at
 *   seven and returns at ten owes exactly what everybody else owes, and meets it
 *   with weekend-weighted work. Without that rule, "my job is demanding" simply
 *   becomes the new way to opt out, which is the failure the product exists to
 *   fix.
 */

export interface TargetInput {
  memberId: string;
  /** 7 minus away days, and only the days their residency covers. */
  presentDays: number;
  /** Last week's carry_out: negative is a deficit, positive is a surplus. */
  carryIn: number;
}

export interface MemberTarget {
  memberId: string;
  baseTarget: number;
  carryIn: number;
  adjustment: number;
  effectiveTarget: number;
  presentDays: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Distributes the week's workload by presence, then adjusts by carry.
 *
 * The sign convention trips people up, so plainly: a deficit last week is a
 * negative `carryIn`, so `−carryIn` is positive and the target **rises**. A
 * surplus lowers it. The cap stops one bad week becoming an impossible one, and
 * stops a large surplus buying a week off entirely.
 *
 * The effective targets deliberately do not sum to the workload. They are the
 * objective the solver minimises deviation from, not a quota it must fill — the
 * solver always assigns every instance.
 */
export function computeTargets(
  totalWeekPoints: number,
  members: TargetInput[],
  carryCapPercent: number,
): MemberTarget[] {
  const weights = members.map((member) => ({
    memberId: member.memberId,
    weight: member.presentDays / 7,
  }));

  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);

  return members.map((member, index) => {
    const weight = weights[index].weight;
    const baseTarget =
      totalWeight > 0 ? (totalWeekPoints * weight) / totalWeight : 0;

    // Floored to whole points: a cap of "50 percent of 105" is 52, not 52.5.
    // Rounding it up would let the adjustment exceed the percentage the house
    // configured, and the worked example in docs/06-ALGORITHMS.md 2.4 depends
    // on the floor — 105 + 52 = 157, not 158.
    const cap = Math.floor((baseTarget * carryCapPercent) / 100);
    const adjustment = clamp(-member.carryIn, -cap, cap);

    return {
      memberId: member.memberId,
      baseTarget: Math.round(baseTarget),
      carryIn: member.carryIn,
      adjustment: Math.round(adjustment),
      effectiveTarget: Math.max(0, Math.round(baseTarget + adjustment)),
      presentDays: member.presentDays,
    };
  });
}

export interface WeekClose {
  memberId: string;
  earnedPoints: number;
  effectiveTarget: number;
  carryOut: number;
}

/**
 * Closing a week: what each member earned against what they owed.
 *
 * `carryOut` becomes next week's `carryIn`, and its running sum over a month is
 * what the penalty is computed from.
 */
export function closeWeek(
  ledger: { memberId: string; earnedPoints: number; effectiveTarget: number }[],
): WeekClose[] {
  return ledger.map((row) => ({
    memberId: row.memberId,
    earnedPoints: row.earnedPoints,
    effectiveTarget: row.effectiveTarget,
    carryOut: row.earnedPoints - row.effectiveTarget,
  }));
}

export interface StandingRow {
  memberId: string;
  earnedPoints: number;
  targetPoints: number;
  carry: number;
  choresDone: number;
  choresMissed: number;
}

/**
 * The leaderboard, ranked. Ties broken by chores done, then by id, so the order
 * is stable between two people looking at the same screen.
 */
export function rankStanding(rows: StandingRow[]): (StandingRow & { rank: number })[] {
  return [...rows]
    .sort((a, b) => {
      if (b.earnedPoints !== a.earnedPoints) return b.earnedPoints - a.earnedPoints;
      if (b.choresDone !== a.choresDone) return b.choresDone - a.choresDone;
      return a.memberId.localeCompare(b.memberId);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * The BRD's headline metric: what share of the confirmed work the top three
 * members did. If this number is falling month over month, the product is
 * working. If it is not, everything else here is decoration.
 */
export function concentrationRatio(rows: StandingRow[]): number {
  const total = rows.reduce((sum, row) => sum + row.earnedPoints, 0);
  if (total === 0) return 0;

  const topThree = [...rows]
    .sort((a, b) => b.earnedPoints - a.earnedPoints)
    .slice(0, 3)
    .reduce((sum, row) => sum + row.earnedPoints, 0);

  return topThree / total;
}
