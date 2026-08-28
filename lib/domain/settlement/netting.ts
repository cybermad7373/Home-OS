/**
 * Settlement netting.
 *
 * Pure: balances in, payment list out. No database, no framework.
 *
 * The invariant that must never break: **the settlement nets to exactly zero**
 * (BR-107, NFR-08). Every rupee somebody pays is a rupee somebody else
 * receives. A settlement that does not net to zero is worse than no settlement
 * at all, because it looks authoritative while quietly inventing or destroying
 * money — so a non-zero sum blocks the close rather than being rounded away.
 */

export interface MemberBalance {
  memberId: string;
  /** Approved expenses this member paid for, in paise. */
  paidPaise: number;
  /** The sum of their splits, their guests' shares included. */
  fairSharePaise: number;
  /** Effort deficit converted to money. Phase 5 fills this in; zero until then. */
  penaltyOwedPaise?: number;
  /** Their slice of the penalty pool, for carrying more than their share. */
  penaltyCreditPaise?: number;
}

export interface ComputedBalance extends Required<MemberBalance> {
  /** paid − fair share. Positive means the house owes them. */
  expenseNetPaise: number;
  /** expense net − penalty owed + penalty credit. */
  finalNetPaise: number;
}

export interface Payment {
  fromMemberId: string;
  toMemberId: string;
  amountPaise: number;
}

/** Positive means the house owes the member. This mapping never inverts. */
export function computeBalances(balances: MemberBalance[]): ComputedBalance[] {
  return balances.map((balance) => {
    const penaltyOwedPaise = balance.penaltyOwedPaise ?? 0;
    const penaltyCreditPaise = balance.penaltyCreditPaise ?? 0;
    const expenseNetPaise = balance.paidPaise - balance.fairSharePaise;

    return {
      ...balance,
      penaltyOwedPaise,
      penaltyCreditPaise,
      expenseNetPaise,
      finalNetPaise: expenseNetPaise - penaltyOwedPaise + penaltyCreditPaise,
    };
  });
}

/**
 * Distributes the penalty pool across the members in effort surplus, in
 * proportion to how much surplus each carried.
 *
 * The remainder is handed out one paisa at a time in member-id order — the same
 * technique the split calculator uses — so that `Σ credit = Σ owed` exactly
 * (BR-107). Proportional division without that step loses paise, and lost paise
 * are what stop a settlement netting to zero.
 *
 * Phase 5 supplies the real carry figures. Until then every member is at zero
 * and this returns an empty map.
 */
export function distributePenaltyPool(
  carries: { memberId: string; carryPoints: number }[],
  penaltyRatePaise: number,
): { owed: Map<string, number>; credit: Map<string, number> } {
  const owed = new Map<string, number>();
  const credit = new Map<string, number>();

  const sorted = [...carries].sort((a, b) =>
    a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0,
  );

  let pool = 0;
  for (const entry of sorted) {
    const deficit = Math.max(0, -entry.carryPoints);
    const amount = deficit * penaltyRatePaise;
    if (amount > 0) {
      owed.set(entry.memberId, amount);
      pool += amount;
    }
  }

  if (pool === 0) return { owed, credit };

  const surpluses = sorted
    .map((entry) => ({ memberId: entry.memberId, surplus: Math.max(0, entry.carryPoints) }))
    .filter((entry) => entry.surplus > 0);

  const totalSurplus = surpluses.reduce((sum, entry) => sum + entry.surplus, 0);

  // Nobody carried a surplus: the pool has no home. Rather than invent one,
  // the penalties are not charged at all — charging money that goes nowhere
  // would break the zero-sum invariant.
  if (totalSurplus === 0) {
    owed.clear();
    return { owed, credit };
  }

  let distributed = 0;
  for (const entry of surpluses) {
    const share = Math.floor((pool * entry.surplus) / totalSurplus);
    credit.set(entry.memberId, share);
    distributed += share;
  }

  // The remainder, one paisa at a time, in the stable order.
  let index = 0;
  while (distributed < pool) {
    const entry = surpluses[index % surpluses.length];
    credit.set(entry.memberId, (credit.get(entry.memberId) ?? 0) + 1);
    distributed += 1;
    index += 1;
  }

  return { owed, credit };
}

/**
 * Greedy largest-debtor to largest-creditor. At most n − 1 payments for n
 * members.
 *
 * The theoretically minimal transfer count is NP-hard, and at eight people the
 * difference is a payment or two. Predictability is worth more here than
 * optimality: the same balances always produce the same payment list, which
 * means two people comparing screens see the same thing.
 */
export function minimiseTransfers(balances: ComputedBalance[]): Payment[] {
  const debtors = balances
    .filter((balance) => balance.finalNetPaise < 0)
    .map((balance) => ({ memberId: balance.memberId, amount: -balance.finalNetPaise }))
    .sort(byAmountThenId);

  const creditors = balances
    .filter((balance) => balance.finalNetPaise > 0)
    .map((balance) => ({ memberId: balance.memberId, amount: balance.finalNetPaise }))
    .sort(byAmountThenId);

  const payments: Payment[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      payments.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountPaise: amount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return payments;
}

/** Largest first; ties broken by id so the output is deterministic. */
function byAmountThenId(
  a: { memberId: string; amount: number },
  b: { memberId: string; amount: number },
): number {
  if (b.amount !== a.amount) return b.amount - a.amount;
  return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
}

export interface SettlementChecks {
  netsToZero: boolean;
  sumOfNetsPaise: number;
  transferCount: number;
  maxPossible: number;
  /** Every member's payments in minus payments out equals their final net. */
  reconciles: boolean;
}

/**
 * The checks the close wizard shows before anybody commits to anything.
 *
 * `netsToZero` false is a defect, not a user error, and blocks the close.
 */
export function checkSettlement(
  balances: ComputedBalance[],
  payments: Payment[],
): SettlementChecks {
  const sumOfNetsPaise = balances.reduce(
    (sum, balance) => sum + balance.finalNetPaise,
    0,
  );

  const movement = new Map<string, number>(
    balances.map((balance) => [balance.memberId, 0]),
  );
  for (const payment of payments) {
    movement.set(
      payment.fromMemberId,
      (movement.get(payment.fromMemberId) ?? 0) - payment.amountPaise,
    );
    movement.set(
      payment.toMemberId,
      (movement.get(payment.toMemberId) ?? 0) + payment.amountPaise,
    );
  }

  const reconciles = balances.every(
    (balance) => (movement.get(balance.memberId) ?? 0) === balance.finalNetPaise,
  );

  return {
    netsToZero: sumOfNetsPaise === 0,
    sumOfNetsPaise,
    transferCount: payments.length,
    maxPossible: Math.max(0, balances.length - 1),
    reconciles,
  };
}

/**
 * A correction to a settled month, agreed by decision (`balance_adjustments`).
 *
 * Direction is the two member ids and never a sign, so `amountPaise` is always
 * positive — the same rule the settlement rows follow (BR-108).
 */
export interface BalanceAdjustment {
  fromMemberId: string;
  toMemberId: string;
  amountPaise: number;
}

/**
 * Folds agreed adjustments into computed balances.
 *
 * An adjustment moves money between two members and creates none, so the sum of
 * `finalNetPaise` is unchanged — which is what keeps a re-close of an adjusted
 * month able to net to zero (BR-107). That property only holds if **both** ends
 * of an adjustment land, so an adjustment naming somebody who is not in this
 * month's balances is skipped whole rather than half-applied. Half of a
 * transfer is money invented.
 */
export function applyAdjustments(
  balances: ComputedBalance[],
  adjustments: BalanceAdjustment[],
): ComputedBalance[] {
  const index = new Map(balances.map((balance) => [balance.memberId, balance]));
  const shift = new Map<string, number>();

  for (const adjustment of adjustments) {
    if (!index.has(adjustment.fromMemberId)) continue;
    if (!index.has(adjustment.toMemberId)) continue;
    if (adjustment.fromMemberId === adjustment.toMemberId) continue;
    if (adjustment.amountPaise <= 0) continue;

    shift.set(
      adjustment.fromMemberId,
      (shift.get(adjustment.fromMemberId) ?? 0) - adjustment.amountPaise,
    );
    shift.set(
      adjustment.toMemberId,
      (shift.get(adjustment.toMemberId) ?? 0) + adjustment.amountPaise,
    );
  }

  return balances.map((balance) => ({
    ...balance,
    finalNetPaise: balance.finalNetPaise + (shift.get(balance.memberId) ?? 0),
  }));
}
