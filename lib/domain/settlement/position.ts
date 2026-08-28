import type { ComputedBalance } from "./netting";

/**
 * The household financial position — docs/06-ALGORITHMS.md section 6.5,
 * BR-280 to BR-288.
 *
 * A position, not a payment list. `netting.ts` still decides who pays whom;
 * this decides what the Home and each member see when they ask "where do we
 * stand". It derives from the settlement arithmetic and never reimplements it:
 * `variance(m)` **is** `expenseNetPaise`, renamed here and nowhere else,
 * because "you have paid ₹1,240 more than your share" and "you are owed ₹1,240"
 * are the same number asked two ways (BR-282).
 */

/** A movement in or out of a named pot. The amount is always positive. */
export interface ReserveMovement {
  kind: "contribution" | "draw";
  amountPaise: number;
}

export interface MemberPosition {
  memberId: string;
  paidPaise: number;
  fairSharePaise: number;
  /** paid − fair share. Positive means the Home owes them. */
  variancePaise: number;
  /** The Home's expected monthly contribution, or null if none is set. */
  expectedPaise: number | null;
  /** paid − expected. Null when nothing is expected. Display-only (BR-280). */
  againstExpectedPaise: number | null;
}

/**
 * `variance` is `expenseNet` under another name, so this maps rather than
 * calculates. An expected contribution charges nobody: it appears here and in
 * no settlement figure at all (BR-280).
 */
export function positionOf(
  balances: ComputedBalance[],
  expectedByMember: Map<string, number> = new Map(),
): MemberPosition[] {
  return balances.map((balance) => {
    const expectedPaise = expectedByMember.get(balance.memberId) ?? null;
    return {
      memberId: balance.memberId,
      paidPaise: balance.paidPaise,
      fairSharePaise: balance.fairSharePaise,
      variancePaise: balance.expenseNetPaise,
      expectedPaise,
      againstExpectedPaise:
        expectedPaise === null ? null : balance.paidPaise - expectedPaise,
    };
  });
}

/** BR-283 — the pot's cash: contributions in, draws out, never negative. */
export function reserveBalance(movements: ReserveMovement[]): number {
  return movements.reduce(
    (sum, movement) =>
      sum + (movement.kind === "contribution" ? movement.amountPaise : -movement.amountPaise),
    0,
  );
}

/**
 * The pot's *position*, which is not its cash.
 *
 * The members have put `Σ contributions` into the pot, so the pot's side of the
 * Home's books is that figure, owed back to them, negated. A draw does not move
 * it: a draw spends the pot's cash and relieves the members of exactly the same
 * cost, because the expense it pays leaves both `paid` and `fair share`
 * (BR-285). That is also why a funded pot reduces nobody's owed figure until
 * the Home draws on it (BR-286) — and why it does not reduce anybody's *after*
 * a draw either. It pays the cost outright.
 */
export function reservePosition(movements: ReserveMovement[]): number {
  return -movements
    .filter((movement) => movement.kind === "contribution")
    .reduce((sum, movement) => sum + movement.amountPaise, 0);
}

export interface PositionChecks {
  /** Σ variance(m) + reserve position. Zero, or the Home has lost money. */
  sumPaise: number;
  balances: boolean;
}

/**
 * BR-288, with the sign the arithmetic actually has.
 *
 * The rule as written in `docs/09-BUSINESS-RULES.md` says
 * `Σ variance(m) + reserve_balance = 0`, which cannot hold alongside BR-284: a
 * Home whose only movement is one ₹5,000 contribution has `Σ variance = +5000`
 * and a balance of `+5000`. What is conserved is the same statement with the
 * pot's position in place of its cash, and that is what this checks.
 *
 * A position view that does not balance is a defect and blocks the close,
 * exactly as a split that does not sum does (NFR-08).
 */
export function checkPosition(
  positions: MemberPosition[],
  movements: ReserveMovement[],
): PositionChecks {
  const sumPaise =
    positions.reduce((sum, position) => sum + position.variancePaise, 0) +
    reservePosition(movements);

  return { sumPaise, balances: sumPaise === 0 };
}
