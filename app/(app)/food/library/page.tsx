import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { LibraryList } from "@/components/food/library-list";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listFoods } from "@/lib/data/food";

export const metadata: Metadata = { title: "Food Library" };

/** S-45 — every distinct dish the Home has eaten, deduplicated (FD-09). */
export default async function FoodLibraryPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const foods = await listFoods(session, context.house.id);

  return (
    <div>
      <PageHeader title="Food Library" subtitle="Every dish the Home has recorded, so it never has to be described twice" />
      <LibraryList foods={foods} currency={context.house.currency} />
    </div>
  );
}
