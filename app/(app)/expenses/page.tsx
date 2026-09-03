import type { Metadata } from "next";
import Link from "next/link";
import { ExpenseList } from "@/components/expenses/expense-list";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listCategories, listExpenses, listPendingApprovals } from "@/lib/data/expenses";
import { getLlmConfig } from "@/lib/data/llm";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Money" };

/** The last twelve months, newest first, for the month picker. */
function recentPeriods(today: string): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const shifted = month - index;
    const shiftYear = year + Math.floor((shifted - 1) / 12);
    const shiftMonth = ((((shifted - 1) % 12) + 12) % 12) + 1;
    return `${shiftYear}-${String(shiftMonth).padStart(2, "0")}`;
  });
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    add?: string;
    category?: string;
    member?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const { period: requested, add, category, member, from, to } = await searchParams;

  const today = houseToday(context.house.timezone);
  const periods = recentPeriods(today);
  const period = requested && periods.includes(requested) ? requested : periods[0];

  const [categories, list, pending, llm] = await Promise.all([
    listCategories(session, context.house.id),
    listExpenses(session, context.house.id, context.me.id, {
      // A date range is a deliberate override of the month picker, so the two
      // are never applied together.
      period: from || to ? undefined : period,
      categoryId: category,
      memberId: member,
      from,
      to,
    }),
    listPendingApprovals(session, context.house.id, context.me.id),
    getLlmConfig(session, context.house.id),
  ]);

  // Natural-language entry needs a key: the house's own, or the environment
  // fallback of a single-house self-host. With neither, the field is absent
  // rather than present and failing.
  const aiEnabled =
    (llm.configured && llm.status !== "disabled") || Boolean(process.env.LLM_API_KEY);

  return (
    <>
      <PageHeader
        title="Money"
        subtitle={`${list.count} ${list.count === 1 ? "expense" : "expenses"}${
          from || to ? " in that range" : " this month"
        }`}
        action={
          pending.length > 0 ? (
            <Link
              href="/expenses/approvals"
              className="touch-target flex items-center rounded-full border border-border px-3 text-[13px] transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              {pending.length} to approve
            </Link>
          ) : null
        }
      />

      <ExpenseList
        expenses={list.expenses.map((expense) => ({
          id: expense.id,
          amountPaise: expense.amountPaise,
          description: expense.description,
          expenseDate: expense.expenseDate,
          status: expense.status,
          isAdjustment: expense.isAdjustment,
          adjustmentForPeriod: expense.adjustmentForPeriod,
          category: expense.category,
          paidBy: expense.paidBy,
          yourSharePaise: expense.yourSharePaise,
        }))}
        totals={{
          totalPaise: list.totalPaise,
          yourSharePaise: list.yourSharePaise,
          yourPaidPaise: list.yourPaidPaise,
        }}
        categories={categories}
        members={context.members}
        me={context.me}
        houseId={context.house.id}
        currency={context.house.currency}
        timezone={context.house.timezone}
        today={today}
        approvalThresholdPaise={context.settings.expense_approval_threshold_paise}
        moneyMode={context.shape.moneyMode}
        period={period}
        periods={periods}
        openAddOnMount={add === "1"}
        aiEnabled={aiEnabled}
      />
    </>
  );
}
