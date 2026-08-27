import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DailyCostPanel } from "@/components/money/daily-cost";
import { getDailyCost } from "@/lib/data/analytics";
import { getHouseContext, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Running cost" };

/**
 * What the house costs to run, per day.
 *
 * A month-end total tells you what you did. A daily rate tells you what you are
 * doing, which is the only one of the two anybody can act on.
 */
export default async function DailyCostPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const { period } = await searchParams;

  const summary = await getDailyCost(session, context.house, context.settings, {
    period,
  });

  return (
    <>
      <PageHeader
        title="Running cost"
        subtitle={`${context.house.name} · ${monthLabel(summary.period)}`}
      />
      <DailyCostPanel
        summary={summary}
        currency={context.house.currency}
        // A family pays as one household, so a per-head figure is arithmetic
        // nobody needs. Flatmates are splitting, and it is the whole point.
        showPerHead={!context.shape.isPot}
      />
    </>
  );
}

function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
