/**
 * Money insights (IN-01, IN-02).
 *
 * What the house spent, on what, who funded it, and who is carrying more than
 * their share. Pure: facts in, report out.
 *
 * Two rules run through the whole file:
 *
 * 1. **Only approved expenses count towards a figure the house acts on.** A
 *    pending expense is a claim, not a cost. It is reported separately as
 *    `pendingPaise` so the house can see there is something waiting, but it
 *    never lands in a category total or a member's position.
 * 2. **Who owes whom comes from the settlement's own calculator.** Reimplementing
 *    the netting here is how the insights screen and the settle screen end up
 *    telling two people different things about the same month.
 */

import { computeBalances, minimiseTransfers } from "@/lib/domain/settlement/netting";
import { bucketKeyOf, bucketsBetween, changePct } from "./buckets";
import type {
  BucketTotal,
  CategoryTotal,
  MoneyInsightsInput,
  MoneyInsightsOutput,
  OwedEdge,
  PaidVsShare,
  WhoPaid,
} from "./types";

export function buildMoneyInsights(input: MoneyInsightsInput): MoneyInsightsOutput {
  const { range, members, categoryFilter, memberFilter, isPot } = input;

  const inRange = input.expenses.filter(
    (expense) => expense.date >= range.from && expense.date <= range.to,
  );

  // The category filter narrows what is reported. The member filter narrows it
  // to what one person *paid for* — the person's own share of everything is a
  // different question, and `paidVsShare` already answers it for everybody.
  const selected = inRange.filter((expense) => {
    if (categoryFilter && expense.categoryId !== categoryFilter) return false;
    if (memberFilter && expense.paidByMemberId !== memberFilter) return false;
    return true;
  });

  const approved = selected.filter((expense) => expense.approved);
  const pendingPaise = selected
    .filter((expense) => !expense.approved)
    .reduce((total, expense) => total + Math.max(0, expense.amountPaise), 0);

  const bucketKeys = bucketsBetween(range.from, range.to, range.granularity);
  const bucketIndex = new Map(bucketKeys.map((key, index) => [key, index]));
  const bucketTotals = bucketKeys.map(() => 0);

  const categories = new Map<string, { name: string; totals: number[] }>();
  const paidByMember = new Map<string, number>();

  for (const expense of approved) {
    const amount = Math.max(0, expense.amountPaise);
    const index = bucketIndex.get(bucketKeyOf(expense.date, range.granularity));
    if (index === undefined) continue;

    bucketTotals[index] += amount;
    paidByMember.set(
      expense.paidByMemberId,
      (paidByMember.get(expense.paidByMemberId) ?? 0) + amount,
    );

    let category = categories.get(expense.categoryId);
    if (!category) {
      category = { name: expense.categoryName, totals: bucketKeys.map(() => 0) };
      categories.set(expense.categoryId, category);
    }
    category.totals[index] += amount;
  }

  // Splits are matched to their expense by id rather than summed wholesale:
  // an unapproved expense already has split rows, and counting them would put
  // a cost on somebody the house has not agreed to yet.
  const approvedIds = new Set(approved.map((expense) => expense.expenseId));
  const fairShareByMember = new Map<string, number>();
  for (const split of input.splits) {
    if (!approvedIds.has(split.expenseId)) continue;
    if (memberFilter && split.memberId !== memberFilter) continue;
    const share =
      Math.max(0, split.sharePaise) +
      Math.max(0, split.guestSharePaise) +
      Math.max(0, split.dependentSharePaise);
    fairShareByMember.set(split.memberId, (fairShareByMember.get(split.memberId) ?? 0) + share);
  }

  const buckets: BucketTotal[] = bucketKeys.map((key, index) => ({
    key,
    totalPaise: bucketTotals[index],
  }));

  const byCategory: CategoryTotal[] = [...categories.entries()]
    .map(([categoryId, category]) => ({
      categoryId,
      name: category.name,
      totalPaise: category.totals.reduce((sum, value) => sum + value, 0),
      changePct: changePct(category.totals.at(-1) ?? 0, category.totals.at(-2) ?? 0),
    }))
    .sort((a, b) => b.totalPaise - a.totalPaise || a.name.localeCompare(b.name));

  const nameOf = (memberId: string) =>
    members.find((member) => member.memberId === memberId)?.displayName ?? "Former member";

  const whoPaid: WhoPaid[] = [...paidByMember.entries()]
    .map(([memberId, totalPaise]) => ({ memberId, name: nameOf(memberId), totalPaise }))
    .sort((a, b) => b.totalPaise - a.totalPaise || a.name.localeCompare(b.name));

  // A member who left mid-period still appears: they paid for things, and a
  // report that drops them makes the month stop adding up.
  const participantIds = new Set([
    ...members.filter((member) => member.active).map((member) => member.memberId),
    ...paidByMember.keys(),
    ...fairShareByMember.keys(),
  ]);

  const paidVsShare: PaidVsShare[] = [...participantIds]
    .map((memberId) => {
      const paidPaise = paidByMember.get(memberId) ?? 0;
      const fairSharePaise = fairShareByMember.get(memberId) ?? 0;
      return {
        memberId,
        name: nameOf(memberId),
        paidPaise,
        fairSharePaise,
        netPaise: paidPaise - fairSharePaise,
      };
    })
    .sort((a, b) => b.netPaise - a.netPaise || a.name.localeCompare(b.name));

  return {
    range,
    buckets,
    totalPaise: bucketTotals.reduce((sum, value) => sum + value, 0),
    pendingPaise,
    byCategory,
    whoPaid,
    paidVsShare,
    owed: isPot ? [] : owedEdges(paidVsShare, nameOf),
  };
}

/**
 * Who pays whom, from the settlement's netting rather than a second copy of it.
 *
 * A pot house is given nothing at all: it records spending and nets no debts
 * (D-19), so an "owed" list there would be an answer to a question the house
 * has decided it does not ask.
 */
function owedEdges(
  positions: PaidVsShare[],
  nameOf: (memberId: string) => string,
): OwedEdge[] {
  const balances = computeBalances(
    positions.map((position) => ({
      memberId: position.memberId,
      paidPaise: position.paidPaise,
      fairSharePaise: position.fairSharePaise,
    })),
  );

  return minimiseTransfers(balances).map((payment) => ({
    fromMemberId: payment.fromMemberId,
    fromName: nameOf(payment.fromMemberId),
    toMemberId: payment.toMemberId,
    toName: nameOf(payment.toMemberId),
    amountPaise: payment.amountPaise,
  }));
}
