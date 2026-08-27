import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import {
  budgetsCsv,
  effortCsv,
  expensesCsv,
  exportFilename,
  membersCsv,
  spendCsv,
  EXPORT_TYPES,
  UTF8_BOM,
  type ExportType,
} from "@/lib/domain/analytics/csv";
import {
  getDailyCost,
  getEffortConcentrationReport,
  getExpenseLedger,
  getMemberPositionReport,
  getSpendReport,
} from "@/lib/data/analytics";
import { getHouseContext, requireSession, type Session } from "@/lib/data/house";
import type { HouseContext } from "@/lib/types/domain";

const querySchema = z.object({
  type: z.enum(EXPORT_TYPES).default("expenses"),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  months: z.coerce.number().int().min(1).max(12).optional(),
});

/**
 * GET /api/analytics/export?type=expenses&period=2026-08 — CSV (AN-06).
 *
 * A download, not JSON: the response carries the content type and filename a
 * spreadsheet needs, and the body is prefixed with a byte-order mark so Excel
 * reads the names and the rupee amounts as UTF-8.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const url = new URL(request.url);
  const query = querySchema.parse({
    type: url.searchParams.get("type") ?? undefined,
    period: url.searchParams.get("period") ?? undefined,
    months: url.searchParams.get("months") ?? undefined,
  });

  const { body, scope } = await buildExport(session, context, query);

  return new NextResponse(UTF8_BOM + body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(query.type, scope)}"`,
      "cache-control": "no-store",
    },
  });
});

async function buildExport(
  session: Session,
  context: HouseContext,
  query: { type: ExportType; period?: string; months?: number },
): Promise<{ body: string; scope: string }> {
  const months = query.months ?? 6;

  switch (query.type) {
    case "expenses": {
      const ledger = await getExpenseLedger(session, context.house, { period: query.period });
      return { body: expensesCsv(ledger.rows), scope: ledger.period };
    }
    case "spend": {
      const report = await getSpendReport(session, context.house, { months });
      return { body: spendCsv(report), scope: `${report.months[0]}-to-${report.months.at(-1)}` };
    }
    case "members": {
      const report = await getMemberPositionReport(session, context.house, {
        period: query.period,
      });
      return { body: membersCsv(report), scope: report.period };
    }
    case "effort": {
      const report = await getEffortConcentrationReport(session, context.house, { months });
      return { body: effortCsv(report), scope: `${report.months[0]}-to-${report.months.at(-1)}` };
    }
    case "budgets": {
      const summary = await getDailyCost(session, context.house, context.settings, {
        period: query.period,
      });
      return { body: budgetsCsv(summary), scope: summary.period };
    }
    default:
      throw new ApiError("VALIDATION_FAILED");
  }
}
