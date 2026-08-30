import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { UTF8_BOM, budgetsCsv, expensesCsv } from "@/lib/domain/analytics/csv";
import {
  choreInsightsCsv,
  foodInsightsCsv,
  homeInsightsCsv,
  insightsFilename,
  moneyInsightsCsv,
  positionCsv,
} from "@/lib/domain/insights/csv";
import { getDailyCost, getExpenseLedger } from "@/lib/data/analytics";
import {
  getChoreInsights,
  getFinancialPosition,
  getFoodInsights,
  getHomeInsights,
  getMoneyInsights,
  resolveRange,
} from "@/lib/data/insights";
import { getHouseContext, requireSession, type Session } from "@/lib/data/house";
import {
  exportQuerySchema,
  searchParamsToObject,
  type ExportView,
} from "@/lib/validation/insights";
import type { Granularity } from "@/lib/domain/insights";
import type { HouseContext } from "@/lib/types/domain";

/**
 * GET /api/insights/export?view=money&period=2026-08 — CSV of any view (IN-10).
 *
 * Three properties this route exists to hold, all of them acceptance criteria:
 *
 *   * **Every view exports.** Not a chosen few, and not a different subset from
 *     the one the screen shows.
 *   * **No gate.** No tier, no cap, no waiting period, and no feature check on
 *     the handler. A member's records are theirs (NFR-19).
 *   * **A category named like a formula cannot execute on open.** The guard is
 *     in `csvField`, which every serialiser here goes through.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const query = exportQuerySchema.parse(
    searchParamsToObject(new URL(request.url).searchParams),
  );

  const { body, scope } = await buildExport(session, context, query);

  return new NextResponse(UTF8_BOM + body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${insightsFilename(query.view, scope)}"`,
      "cache-control": "no-store",
    },
  });
});

async function buildExport(
  session: Session,
  context: HouseContext,
  query: {
    view: ExportView;
    period?: string;
    granularity: string;
    months: number;
    category?: string;
    member?: string;
  },
): Promise<{ body: string; scope: string }> {
  const insightQuery = {
    period: query.period,
    granularity: query.granularity as Granularity,
    months: query.months,
    categoryId: query.category,
    memberId: query.member,
  };
  const range = resolveRange(context.house, { ...insightQuery, type: "money" });
  const scope = `${range.from}-to-${range.to}`;

  switch (query.view) {
    case "money": {
      const scoped = { ...insightQuery, type: "money" as const };
      return {
        body: moneyInsightsCsv(await getMoneyInsights(session, context, scoped, range)),
        scope,
      };
    }
    case "chores": {
      const scoped = { ...insightQuery, type: "chores" as const };
      return {
        body: choreInsightsCsv(await getChoreInsights(session, context, scoped, range)),
        scope,
      };
    }
    case "food": {
      const scoped = { ...insightQuery, type: "food" as const };
      return {
        body: foodInsightsCsv(await getFoodInsights(session, context, scoped, range)),
        scope,
      };
    }
    case "home":
      return {
        body: homeInsightsCsv(await getHomeInsights(session, context, range)),
        scope,
      };
    case "position": {
      const report = await getFinancialPosition(session, context, query.period);
      return { body: positionCsv(report), scope: report.period };
    }
    case "expenses": {
      const ledger = await getExpenseLedger(session, context.house, { period: query.period });
      return { body: expensesCsv(ledger.rows), scope: ledger.period };
    }
    case "budgets": {
      const summary = await getDailyCost(session, context.house, context.settings, {
        period: query.period,
      });
      return { body: budgetsCsv(summary), scope: summary.period };
    }
  }
}
