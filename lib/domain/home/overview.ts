/**
 * The Home overview's pure layer — S-51.
 *
 * The screen itself is a composition over other modules; what is genuinely a
 * decision, and therefore worth testing on its own, is *what counts as
 * pending*, *who is allowed to see it*, and *in what order it is shown*. That
 * lives here, framework- and database-free.
 */

import type { ComputedBalance, Payment } from "@/lib/domain/settlement/netting";
import { computeBalances, minimiseTransfers } from "@/lib/domain/settlement/netting";

export interface PendingCounts {
  /** People waiting to be let into the Home. Leads only. */
  joinRequests: number;
  /** Expenses above the threshold waiting on this member's approval. */
  expenseApprovals: number;
  /** Decisions whose queue is waiting on this member's response. */
  decisions: number;
  /** Chore completions this member can confirm. */
  choreConfirmations: number;
}

export interface PendingItem {
  key: keyof PendingCounts;
  count: number;
  /** Singular and plural are different sentences, so both are decided here. */
  label: string;
  href: string;
  /**
   * True for the two queues whose stalling blocks somebody else: a decision
   * nobody answers never applies, and a completion nobody confirms never earns
   * its points.
   */
  urgent: boolean;
}

/**
 * The fixed order. Decisions come first because they are the only queue that
 * can hold the whole Home still; confirmations second because they hold one
 * person's points; approvals third; join requests last, since a person waiting
 * outside is not blocked on any work already recorded.
 */
const ORDER: {
  key: keyof PendingCounts;
  href: string;
  urgent: boolean;
  one: (n: number) => string;
  many: (n: number) => string;
  leadOnly?: boolean;
}[] = [
  {
    key: "decisions",
    href: "/more/approvals",
    urgent: true,
    one: () => "1 decision is waiting on you",
    many: (n) => `${n} decisions are waiting on you`,
  },
  {
    key: "choreConfirmations",
    href: "/chores",
    urgent: true,
    one: () => "1 chore is waiting on your confirmation",
    many: (n) => `${n} chores are waiting on your confirmation`,
  },
  {
    key: "expenseApprovals",
    href: "/expenses/approvals",
    urgent: false,
    one: () => "1 expense needs your approval",
    many: (n) => `${n} expenses need your approval`,
  },
  {
    key: "joinRequests",
    href: "/house/members",
    urgent: false,
    leadOnly: true,
    one: () => "1 person is waiting to join",
    many: (n) => `${n} people are waiting to join`,
  },
];

/**
 * The pending list for one caller. A zero is omitted rather than shown as an
 * empty row, and a queue the caller cannot act on is not theirs to see: an
 * ordinary member is never told about join requests, because the only control
 * that would clear them is one they do not have.
 */
export function pendingItems(
  counts: PendingCounts,
  options: { isLead: boolean },
): PendingItem[] {
  return ORDER.flatMap((entry) => {
    if (entry.leadOnly && !options.isLead) return [];
    const count = counts[entry.key];
    if (count <= 0) return [];
    return [
      {
        key: entry.key,
        count,
        label: count === 1 ? entry.one(count) : entry.many(count),
        href: entry.href,
        urgent: entry.urgent,
      },
    ];
  });
}

/** What the caller can actually act on, which is what the headline counts. */
export function totalPending(
  counts: PendingCounts,
  options: { isLead: boolean },
): number {
  return pendingItems(counts, options).reduce((sum, item) => sum + item.count, 0);
}

export interface OwesRow {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountPaise: number;
}

/**
 * Who owes whom, for everyone — DB-03, not only the caller's own row.
 *
 * The same two pure functions the settlement uses, so the Home screen and the
 * settle sheet can never disagree about who pays whom. `netPaise` is already
 * "paid minus fair share" from the live period read; positive means the Home
 * owes them.
 */
export function owesRows(
  position: { memberId: string; displayName: string; netPaise: number }[],
): OwesRow[] {
  const names = new Map(position.map((row) => [row.memberId, row.displayName]));

  const balances: ComputedBalance[] = computeBalances(
    position.map((row) => ({
      memberId: row.memberId,
      // `netPaise` is the net already, so it is expressed as paid-with-no-share
      // rather than re-deriving two figures the caller does not have.
      paidPaise: row.netPaise,
      fairSharePaise: 0,
    })),
  );

  const payments: Payment[] = minimiseTransfers(balances);

  return payments.map((payment) => ({
    fromMemberId: payment.fromMemberId,
    fromName: names.get(payment.fromMemberId) ?? "Someone",
    toMemberId: payment.toMemberId,
    toName: names.get(payment.toMemberId) ?? "Someone",
    amountPaise: payment.amountPaise,
  }));
}

/**
 * The caller's own rows first, then the rest — the screen shows three, and
 * three that do not involve you are three wasted rows.
 */
export function ownRowsFirst(rows: OwesRow[], myMemberId: string): OwesRow[] {
  const mine = rows.filter(
    (row) => row.fromMemberId === myMemberId || row.toMemberId === myMemberId,
  );
  const others = rows.filter(
    (row) => row.fromMemberId !== myMemberId && row.toMemberId !== myMemberId,
  );
  return [...mine, ...others];
}
