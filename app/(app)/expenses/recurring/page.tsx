import type { Metadata } from "next";
import { RecurringList } from "@/components/expenses/recurring-list";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listCategories, listRecurring } from "@/lib/data/expenses";

export const metadata: Metadata = { title: "Recurring expenses" };

export default async function RecurringPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const [recurring, categories] = await Promise.all([
    listRecurring(session, context.house.id),
    listCategories(session, context.house.id),
  ]);

  return (
    <>
      <PageHeader
        title="Recurring"
        subtitle="Posted automatically on their day, at 6am house time"
      />
      <RecurringList
        recurring={recurring}
        categories={categories}
        members={context.members}
        currency={context.house.currency}
        isAdmin={context.isAdmin}
      />
    </>
  );
}
