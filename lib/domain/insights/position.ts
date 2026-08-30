/**
 * The household financial position (IN-09).
 *
 * Expected against actual, fair share against paid, the Home's surplus or
 * shortfall, and the reserve balance with its movements.
 *
 * The acceptance criterion is the whole point of the file: **"paid minus fair
 * share" must equal the settlement's `expense_net` for every member, from the
 * same calculator.** So `netPaise` is not computed here — it comes out of
 * `computeBalances`, the function the settlement itself uses. If the two ever
 * disagree, they disagree because somebody changed one calculator, and there
 * is only one to change.
 */

import { computeBalances } from "@/lib/domain/settlement/netting";
import type { FinancialPositionInput, FinancialPositionOutput, PositionMember } from "./types";

export function buildFinancialPosition(
  input: FinancialPositionInput,
): FinancialPositionOutput {
  const balances = new Map(
    computeBalances(
      input.members.map((member) => ({
        memberId: member.memberId,
        paidPaise: member.paidPaise,
        fairSharePaise: member.fairSharePaise,
      })),
    ).map((balance) => [balance.memberId, balance]),
  );

  const members: PositionMember[] = input.members
    .map((member) => ({
      ...member,
      netPaise: balances.get(member.memberId)?.expenseNetPaise ?? 0,
      contributionGapPaise: member.paidPaise - member.expectedContributionPaise,
    }))
    .sort((a, b) => b.netPaise - a.netPaise || a.displayName.localeCompare(b.displayName));

  const expectedPaise = total(input.members, "expectedContributionPaise");
  const actualPaise = total(input.members, "paidPaise");

  return {
    period: input.period,
    members,
    expectedPaise,
    actualPaise,
    fairSharePaise: total(input.members, "fairSharePaise"),
    // Positive: the Home spent more than it asked its members for. Negative:
    // it asked for more than it has actually seen come in.
    surplusPaise: actualPaise - expectedPaise,
    reserveBalancePaise: input.reserveBalancePaise,
    reserveMovements: [...input.reserveMovements].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

function total<K extends string>(rows: Record<K, number>[], key: K): number {
  return rows.reduce((sum, row) => sum + row[key], 0);
}
