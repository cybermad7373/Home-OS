import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { RestrictionsPanel } from "@/components/food/restrictions-panel";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listMyRestrictions } from "@/lib/data/food";

export const metadata: Metadata = { title: "Food Preferences" };

/**
 * Preferences — docs/15-FOOD-SPEC.md sections 5 and 5.2a. Ratings live inline
 * on each meal and library entry; this screen is for the standing facts:
 * restrictions, private to the person they describe (BR-226).
 */
export default async function FoodPreferencesPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const restrictions = await listMyRestrictions(session, context.me.id);

  return (
    <div>
      <PageHeader title="Food Preferences" subtitle="What you like, and what you cannot eat" />
      <RestrictionsPanel restrictions={restrictions} memberId={context.me.id} />
    </div>
  );
}
