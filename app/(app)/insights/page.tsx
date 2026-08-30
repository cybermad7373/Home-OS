import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { FilterBar, hrefFor, type FilterState } from "@/components/insights/filter-bar";
import { ChoresView, FoodView, HomeView, MoneyView } from "@/components/insights/views";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getInsights } from "@/lib/data/insights";
import { listCategories } from "@/lib/data/expenses";
import { insightsQuerySchema } from "@/lib/validation/insights";
import { houseToday } from "@/lib/utils/date";
import type { Granularity, InsightType } from "@/lib/domain/insights";

export const metadata: Metadata = { title: "Insights" };

/**
 * Phase 15 — one screen that answers questions about money, work, food and the
 * Home itself, replacing the four-tab analytics page.
 *
 * The filters are in the URL and the reads happen on the server, so a view is
 * shareable and there is no page-per-report anywhere. The screen calls the same
 * `getInsights` as `GET /api/insights`; a native client and this page cannot
 * report a different August.
 *
 * A malformed query falls back rather than erroring. This is a read: a typed
 * URL should show the house something, not a validation screen.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const params = await searchParams;

  const today = houseToday(context.house.timezone);
  const parsed = insightsQuerySchema.safeParse(flatten(params));
  const query = parsed.success ? parsed.data : insightsQuerySchema.parse({});

  const period = query.period ?? today.slice(0, 7);
  const state: FilterState = {
    type: query.type as InsightType,
    period,
    granularity: query.granularity,
    months: query.months,
    category: query.category,
    member: query.member,
  };

  const [result, categories] = await Promise.all([
    getInsights(session, context, {
      type: state.type,
      period,
      granularity: state.granularity as Granularity,
      months: state.months,
      categoryId: state.category,
      memberId: state.member,
    }),
    listCategories(session, context.house.id),
  ]);

  const exportHref = `/api/insights/export?view=${state.type}&period=${period}&granularity=${state.granularity}&months=${state.months}`;

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle={`${context.house.name} · ${result.range.from} to ${result.range.to}`}
      />

      <FilterBar
        state={state}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        members={context.members
          .filter((member) => member.status === "active")
          .map((member) => ({ memberId: member.id, displayName: member.displayName }))}
      />

      {result.type === "money" ? (
        <MoneyView
          report={result.money}
          currency={context.house.currency}
          isPot={context.shape.isPot}
        />
      ) : null}
      {result.type === "chores" ? <ChoresView report={result.chores} /> : null}
      {result.type === "food" ? (
        <FoodView report={result.food} currency={context.house.currency} />
      ) : null}
      {result.type === "home" ? <HomeView report={result.home} /> : null}

      <Card className="mt-3">
        <CardTitle>Take your records with you</CardTitle>
        <CardDescription>
          No tier, no cap, and no waiting period. A spreadsheet reads any of these.
        </CardDescription>
        <div className="mt-3 flex flex-wrap gap-2">
          <ExportLink href={exportHref}>This view (CSV)</ExportLink>
          <ExportLink href={`/api/insights/export?view=position&period=${period}`}>
            Where the home stands
          </ExportLink>
          <ExportLink href={`/api/insights/export?view=expenses&period=${period}`}>
            Expense ledger
          </ExportLink>
          <ExportLink href="/api/insights/export/full">Everything, all time</ExportLink>
          <ExportLink href={`/api/insights/statement/${period}`}>
            Settlement statement (PDF)
          </ExportLink>
        </div>
      </Card>

      <p className="caption-text mt-4 text-text-muted">
        <Link href={hrefFor(state, { type: "home" })} className="text-primary">
          How the home is doing
        </Link>
        {" · "}
        <Link href="/settle" className="text-primary">
          Settle up
        </Link>
      </p>
    </>
  );
}

/**
 * An export is a document the browser fetches, not a route the app navigates
 * to, so these are plain anchors rather than `Link`s: a client-side navigation
 * to a CSV would leave the app showing a blank screen.
 */
function ExportLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="touch-target inline-flex items-center rounded-[10px] border border-border px-3 text-[15px] text-text-muted"
    >
      {children}
    </a>
  );
}

function flatten(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) out[key] = single;
  }
  return out;
}
