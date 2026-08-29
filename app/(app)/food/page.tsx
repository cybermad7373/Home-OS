import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { MealList } from "@/components/food/meal-list";
import { FoodHomeClient } from "@/components/food/food-home-client";
import { PlannedMeals } from "@/components/food/planned-meals";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listMeals, listMealPlans } from "@/lib/data/food";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Food" };

/**
 * Food — docs/15-FOOD-SPEC.md section 8. Today's "what did you eat?", the
 * two-and-two suggestion card, and the three destinations underneath.
 */
export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const { add } = await searchParams;

  const today = houseToday(context.house.timezone);
  const recentMeals = await listMeals(session, context.house.id, { limit: 5 });
  const plans = await listMealPlans(session, context.house.id, { from: today });

  return (
    <div>
      <PageHeader title="Food" subtitle="What the Home ate, what it cost, whether anyone liked it" />

      <FoodHomeClient
        members={context.members}
        today={today}
        currency={context.house.currency}
        openAddOnMount={add === "1"}
      />

      <div className="my-4 flex gap-4 border-b border-border pb-2">
        <Link href="/food/library" className="caption-text text-primary">
          Food Library
        </Link>
        <Link href="/food/history" className="caption-text text-primary">
          Meal History
        </Link>
        <Link href="/food/preferences" className="caption-text text-primary">
          Preferences
        </Link>
        <Link href="/food/shopping" className="caption-text text-primary">
          Shopping List
        </Link>
      </div>

      <h2 className="heading-text mb-2">Planned</h2>
      <PlannedMeals plans={plans} members={context.members} />

      <h2 className="heading-text mb-2 mt-4">Recent</h2>
      <MealList meals={recentMeals} currency={context.house.currency} />
    </div>
  );
}
