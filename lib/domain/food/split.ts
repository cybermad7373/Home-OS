/**
 * Per-person meal cost — pure, no database and no framework.
 *
 * The one invariant that must hold: shares sum exactly to the meal's total
 * (docs/15-FOOD-SPEC.md section 2.1). Participants, not Home size — a ₹180
 * meal three people ate is ₹60 each, not spread across everyone in the house.
 * The remainder is handed out one paisa at a time in ascending member-id
 * order, the same rule expense splits use (lib/domain/expenses/split.ts).
 */

export interface MealShare {
  memberId: string;
  sharePaise: number;
}

export class MealSplitError extends Error {
  readonly code: "NO_PARTICIPANTS";
  constructor(code: "NO_PARTICIPANTS") {
    super(code);
    this.code = code;
  }
}

/**
 * Splits `totalPaise` across `participantMemberIds`. Throws `NO_PARTICIPANTS`
 * for an empty list — a meal with no recorded participants has no per-person
 * cost and must say so rather than guess (section 2.1).
 */
export function computeMealShares(
  totalPaise: number,
  participantMemberIds: string[],
): MealShare[] {
  if (participantMemberIds.length === 0) {
    throw new MealSplitError("NO_PARTICIPANTS");
  }

  const sortedIds = [...participantMemberIds].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  const headCount = sortedIds.length;
  const base = Math.trunc(totalPaise / headCount);
  const remainder = totalPaise - base * headCount;

  return sortedIds.map((memberId, index) => ({
    memberId,
    sharePaise: base + (index < remainder ? 1 : 0),
  }));
}
