import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ShoppingListClient } from "@/components/food/shopping-list-client";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listShoppingItems } from "@/lib/data/food";

export const metadata: Metadata = { title: "Shopping List" };

/** Shopping List (S-53) — docs/15-FOOD-SPEC.md section 13. */
export default async function ShoppingListPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const items = await listShoppingItems(session, context.house.id);

  return (
    <>
      <PageHeader title="Shopping list" subtitle="Derived from meal plans, not a module of its own" />
      <ShoppingListClient
        initialItems={items}
        currency={context.house.currency}
        myMemberId={context.me.id}
        isLead={context.isLead}
      />
    </>
  );
}
