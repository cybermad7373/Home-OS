export interface SpendExpense {
  period: string;
  categoryId: string;
  categoryName: string;
  amountPaise: number;
}

export interface SpendReportInput {
  expenses: SpendExpense[];
  /** Ordered oldest-first periods in YYYY-MM format. */
  months: string[];
}

export interface SpendReportCategory {
  categoryId: string;
  name: string;
  totals: number[];
}

export interface SpendReport {
  months: string[];
  totals: number[];
  categories: SpendReportCategory[];
}

export interface MemberPositionMember {
  memberId: string;
  displayName: string;
  active: boolean;
}

export interface MemberPositionExpense {
  expenseId: string;
  paidByMemberId: string;
  amountPaise: number;
  approved: boolean;
}

export interface MemberPositionSplit {
  expenseId: string;
  memberId: string;
  sharePaise: number;
  guestSharePaise: number;
  dependentSharePaise: number;
}

export interface MemberPositionReportInput {
  period: string;
  members: MemberPositionMember[];
  expenses: MemberPositionExpense[];
  splits: MemberPositionSplit[];
}

export interface MemberPositionReportRow {
  memberId: string;
  displayName: string;
  paidPaise: number;
  fairSharePaise: number;
  netPaise: number;
}

export interface MemberPositionReport {
  period: string;
  totalPaidPaise: number;
  totalFairSharePaise: number;
  members: MemberPositionReportRow[];
}

export interface EffortConcentrationRow {
  month: string;
  memberId: string;
  earnedPoints: number;
}

export interface EffortConcentrationReportInput {
  /** Ordered oldest-first periods in YYYY-MM. */
  months: string[];
  rows: EffortConcentrationRow[];
}

export interface EffortConcentrationHistoryRow {
  month: string;
  totalEarnedPoints: number;
  topThreeEarnedPoints: number;
  concentrationRatio: number;
}

export interface EffortConcentrationReport {
  months: string[];
  history: EffortConcentrationHistoryRow[];
}

/** Groups already-approved expense facts for charts and exports. */
export function buildSpendReport(input: SpendReportInput): SpendReport {
  const monthIndex = new Map(input.months.map((month, index) => [month, index]));
  const categoryMap = new Map<string, SpendReportCategory>();
  const totals = input.months.map(() => 0);

  for (const expense of input.expenses) {
    const month = monthIndex.get(expense.period);
    if (month === undefined) continue;

    const amount = Math.max(0, expense.amountPaise);
    totals[month] += amount;

    let category = categoryMap.get(expense.categoryId);
    if (!category) {
      category = {
        categoryId: expense.categoryId,
        name: expense.categoryName,
        totals: input.months.map(() => 0),
      };
      categoryMap.set(expense.categoryId, category);
    }
    category.totals[month] += amount;
  }

  const categories = [...categoryMap.values()].sort((a, b) => {
    const aRecent = a.totals.at(-1) ?? 0;
    const bRecent = b.totals.at(-1) ?? 0;
    return bRecent - aRecent || a.name.localeCompare(b.name);
  });

  return { months: [...input.months], totals, categories };
}

/**
 * Shows who funded approved spending and who was allocated its cost. Stored
 * split rows are the source of truth: they preserve guest and dependent shares
 * and keep former members visible for the period they participated in.
 */
export function buildMemberPositionReport(input: MemberPositionReportInput): MemberPositionReport {
  const approvedExpenseIds = new Set<string>();
  const paidByMember = new Map<string, number>();

  for (const expense of input.expenses) {
    if (!expense.approved) continue;
    const amount = Math.max(0, expense.amountPaise);
    approvedExpenseIds.add(expense.expenseId);
    paidByMember.set(
      expense.paidByMemberId,
      (paidByMember.get(expense.paidByMemberId) ?? 0) + amount,
    );
  }

  const fairShareByMember = new Map<string, number>();
  for (const split of input.splits) {
    if (!approvedExpenseIds.has(split.expenseId)) continue;
    const share =
      Math.max(0, split.sharePaise) +
      Math.max(0, split.guestSharePaise) +
      Math.max(0, split.dependentSharePaise);
    fairShareByMember.set(split.memberId, (fairShareByMember.get(split.memberId) ?? 0) + share);
  }

  const members = input.members
    .filter(
      (member) =>
        member.active || paidByMember.has(member.memberId) || fairShareByMember.has(member.memberId),
    )
    .map((member) => {
      const paidPaise = paidByMember.get(member.memberId) ?? 0;
      const fairSharePaise = fairShareByMember.get(member.memberId) ?? 0;
      return {
        memberId: member.memberId,
        displayName: member.displayName,
        paidPaise,
        fairSharePaise,
        netPaise: paidPaise - fairSharePaise,
      };
    })
    .sort((a, b) => b.netPaise - a.netPaise);

  return {
    period: input.period,
    totalPaidPaise: members.reduce((total, member) => total + member.paidPaise, 0),
    totalFairSharePaise: members.reduce((total, member) => total + member.fairSharePaise, 0),
    members,
  };
}

/** Measures the share of confirmed effort earned by the top three members. */
export function buildEffortConcentrationReport(
  input: EffortConcentrationReportInput,
): EffortConcentrationReport {
  const pointsByMonth = new Map<string, Map<string, number>>();
  for (const month of input.months) pointsByMonth.set(month, new Map());

  for (const row of input.rows) {
    const members = pointsByMonth.get(row.month);
    if (!members) continue;
    members.set(row.memberId, (members.get(row.memberId) ?? 0) + Math.max(0, row.earnedPoints));
  }

  const history = input.months.map((month) => {
    const points = [...(pointsByMonth.get(month)?.values() ?? [])].sort((a, b) => b - a);
    const totalEarnedPoints = points.reduce((sum, value) => sum + value, 0);
    const topThreeEarnedPoints = points.slice(0, 3).reduce((sum, value) => sum + value, 0);
    return {
      month,
      totalEarnedPoints,
      topThreeEarnedPoints,
      concentrationRatio: totalEarnedPoints === 0 ? 0 : topThreeEarnedPoints / totalEarnedPoints,
    };
  });

  return { months: [...input.months], history };
}
