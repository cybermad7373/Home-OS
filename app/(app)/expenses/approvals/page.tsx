import type { Metadata } from "next";
import { ApprovalList } from "@/components/expenses/approval-list";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listPendingApprovals } from "@/lib/data/expenses";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const pending = await listPendingApprovals(session, context.house.id, context.me.id);

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Expenses above the house threshold need somebody other than the payer"
      />
      <ApprovalList
        expenses={pending.map((expense) => ({
          id: expense.id,
          amountPaise: expense.amountPaise,
          description: expense.description,
          expenseDate: expense.expenseDate,
          category: { name: expense.category.name, icon: expense.category.icon },
          paidBy: {
            displayName: expense.paidBy.displayName,
            avatarUrl: expense.paidBy.avatarUrl,
          },
          yourSharePaise: expense.yourSharePaise,
        }))}
        currency={context.house.currency}
        timezone={context.house.timezone}
      />
    </>
  );
}
