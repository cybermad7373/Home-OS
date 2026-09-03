import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { LibraryList } from "@/components/food/library-list";
import { MergeDuplicates } from "@/components/food/merge-duplicates";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listFoodPreferences, listFoods } from "@/lib/data/food";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Food Library" };

/** S-45 — every distinct dish the Home has eaten, deduplicated (FD-09). */
export default async function FoodLibraryPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const [foods, preferences] = await Promise.all([
    listFoods(session, context.house.id),
    listFoodPreferences(session, context.house.id),
  ]);

  const myRatings = new Map(
    preferences
      .filter((p) => p.memberId === context.me.id && p.foodId)
      .map((p) => [p.foodId as string, p.rating]),
  );

  // Section 5.1: "liked by 6 of 7" — the Home's aggregate for a food, computed
  // from who has rated it at all, not just who liked it.
  const homeLikes = new Map<string, { likes: number; total: number }>();
  for (const pref of preferences) {
    if (!pref.foodId) continue;
    const entry = homeLikes.get(pref.foodId) ?? { likes: 0, total: 0 };
    entry.total += 1;
    if (pref.rating === "like") entry.likes += 1;
    homeLikes.set(pref.foodId, entry);
  }

  return (
    <>
      <PageHeader
        title="Library"
        subtitle="Every dish the home has recorded, so it never has to be described twice"
      />
      {context.isLead ? <MergeDuplicates foods={foods} /> : null}
      <LibraryList
        foods={foods}
        currency={context.house.currency}
        myRatings={myRatings}
        homeLikes={homeLikes}
        today={houseToday(context.house.timezone)}
      />
    </>
  );
}
