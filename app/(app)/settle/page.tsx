import type { Metadata } from "next";
import Link from "next/link";
import { SettlementList } from "@/components/settle/settlement-list";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button-variants";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getPeriodPosition, listSettlements } from "@/lib/data/settlement";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Settle" };

function recentPeriods(today: string): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const shifted = month - index;
    const shiftYear = year + Math.floor((shifted - 1) / 12);
    const shiftMonth = ((((shifted - 1) % 12) + 12) % 12) + 1;
    return `${shiftYear}-${String(shiftMonth).padStart(2, "0")}`;
  });
}

export default async function SettlePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const { period: requested } = await searchParams;

  // Nothing to settle when expenses create no debts. The link is hidden, but a
  // bookmark, a shared URL or a back button can still land here, and an empty
  // settlement sheet reads like a bug rather than an answer.
  if (context.shape.isPot) {
    return (
      <>
        <PageHeader title="Settle up" />
        <EmptyState
          title="Nobody owes anybody"
          body="This home spends from one pot, so expenses are recorded against whoever paid and never turn into debts. Change that under How money works in house settings."
          action={
            <Link href="/money/daily" className={buttonVariants({ variant: "outline" })}>
              See what the house is spending
            </Link>
          }
        />
      </>
    );
  }

  const today = houseToday(context.house.timezone);
  const periods = recentPeriods(today);
  const period = requested && periods.includes(requested) ? requested : periods[0];

  const [view, settlements] = await Promise.all([
    getPeriodPosition(session, context.house.id, period),
    listSettlements(session, context.house.id, period),
  ]);

  const statusLabel: Record<string, string> = {
    open: "Open",
    closing: "Closing — waiting on payments",
    closed: "Closed and locked",
    reopened: "Reopened",
  };

  return (
    <>
      <PageHeader
        title="Settle"
        subtitle={statusLabel[view.status] ?? view.status}
        action={
          view.reopenCount > 0 ? (
            <Badge tone="info">Reopened {view.reopenCount}×</Badge>
          ) : null
        }
      />

      <form className="mb-3 flex items-center gap-2">
        <Select
          aria-label="Month"
          name="period"
          defaultValue={period}
          className="h-9 w-auto text-[13px]"
        >
          {periods.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Show
        </button>

        {context.isAdmin && view.status === "open" ? (
          <Link
            href={`/expenses/close?period=${period}`}
            className={buttonVariants({ size: "sm", className: "ml-auto" })}
          >
            Close this month
          </Link>
        ) : null}
      </form>

      <SettlementList
        settlements={settlements}
        period={period}
        currency={context.house.currency}
        myMemberId={context.me.id}
        periodStatus={view.status}
      />
    </>
  );
}
