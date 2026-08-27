import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryList } from "@/components/house/category-list";
import { getDailyCost } from "@/lib/data/analytics";
import { listCategories } from "@/lib/data/expenses";
import { getHouseContext, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Categories" };

/**
 * Categories and their budgets. Everybody can see them; only an admin edits.
 *
 * The month-to-date figures come from the same summary the running-cost screen
 * uses, so the two screens can never disagree about what a category has cost.
 */
export default async function CategoriesPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const [categories, summary] = await Promise.all([
    listCategories(session, context.house.id),
    getDailyCost(session, context.house, context.settings),
  ]);

  const spentByCategory = Object.fromEntries(
    summary.categories.map((row) => [row.categoryId, row.spentPaise]),
  );

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="What the house buys, and what it means to spend on each"
      />
      <CategoryList
        categories={categories}
        spentByCategory={spentByCategory}
        currency={context.house.currency}
        isAdmin={context.isAdmin}
      />
    </>
  );
}
