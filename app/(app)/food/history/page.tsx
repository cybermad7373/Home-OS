import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { MealList } from "@/components/food/meal-list";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listMeals } from "@/lib/data/food";

export const metadata: Metadata = { title: "Meal History" };

/** S-42/S-44 — the Home's food history, everyone's, in one list. */
export default async function MealHistoryPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const meals = await listMeals(session, context.house.id, { limit: 100 });

  return (
    <>
      <PageHeader title="Meal history" subtitle="What was eaten, by whom, and what it cost" />
      <MealList meals={meals} currency={context.house.currency} />
    </>
  );
}
