import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Columns } from "@/components/layout/columns";
import { Section } from "@/components/layout/section";
import { MealList } from "@/components/food/meal-list";
import { FoodHomeClient } from "@/components/food/food-home-client";
import { PlannedMeals } from "@/components/food/planned-meals";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listMeals, listMealPlans } from "@/lib/data/food";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Food" };

/**
 * Food — docs/15-FOOD-SPEC.md section 8. Today's "what did you eat?", the
 * two-and-two suggestion card, and the rest of the module underneath.
 *
 * The four sub-screens used to be a row of 12px links in brand colour above a
 * hairline, which read as a tab bar that was not one: they navigate away
 * rather than switching what is below them. They are chips now, which is what
 * a set of sideways destinations looks like everywhere else in this app.
 */
const ELSEWHERE = [
  { href: "/food/library", label: "Library" },
  { href: "/food/shopping", label: "Shopping list" },
  { href: "/food/history", label: "History" },
  { href: "/food/preferences", label: "Preferences" },
];

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const { add } = await searchParams;

  const today = houseToday(context.house.timezone);
  const [recentMeals, plans] = await Promise.all([
    listMeals(session, context.house.id, { limit: 5 }),
    listMealPlans(session, context.house.id, { from: today }),
  ]);

  return (
    <>
      <PageHeader
        title="Food"
        subtitle="What the home ate, what it cost, whether anybody liked it"
      />

      {/* The record is the main column; the prompt to add to it, what to try
          and the rest of the module are the rail. */}
      <Columns
        asideFirst
        main={
          <>
            <Section label="Planned" className="mt-0">
              <PlannedMeals plans={plans} members={context.members} />
            </Section>

            <Section
              label="Recently eaten"
              href="/food/history"
              linkLabel="History"
            >
              <MealList meals={recentMeals} currency={context.house.currency} />
            </Section>
          </>
        }
        aside={
          <>
            <FoodHomeClient
              members={context.members}
              today={today}
              currency={context.house.currency}
              openAddOnMount={add === "1"}
            />

            <ul className="scroll-x mt-6 flex gap-2 lg:mx-0 lg:flex-wrap lg:px-0">
              {ELSEWHERE.map((entry) => (
                <li key={entry.href} className="shrink-0">
                  <Link
                    href={entry.href}
                    className="flex h-9 items-center rounded-full border border-border px-3.5 text-[13px] text-text-muted transition-colors hover:border-border-strong hover:text-text"
                  >
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        }
      />
    </>
  );
}
