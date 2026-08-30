import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { UTF8_BOM, toCsv } from "@/lib/domain/analytics/csv";
import { insightsFilename } from "@/lib/domain/insights/csv";
import { getFullHistory } from "@/lib/data/insights";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { paiseToRupeeString } from "@/lib/utils/money";
import { houseToday } from "@/lib/utils/date";

/**
 * GET /api/insights/export/full — every record the Home holds (IN-10, NFR-19).
 *
 * One file rather than an archive of four. A single CSV with a Section column
 * opens in a spreadsheet, filters and pivots on that column, and needs no
 * archiving dependency to produce or a second tool to read — which matters for
 * an export whose whole promise is that a member can always get their records
 * out.
 *
 * No tier, no cap, no waiting period, and no feature gate on the handler.
 */
export const GET = route(async () => {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const records = await getFullHistory(session, context);

  const body = toCsv(
    ["Section", "Date", "What", "Who", "Amount", "Detail"],
    records.map((record) => [
      record.section,
      record.date,
      record.what,
      record.who,
      record.amountPaise === null ? "" : paiseToRupeeString(record.amountPaise),
      record.detail,
    ]),
  );

  return new NextResponse(UTF8_BOM + body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${insightsFilename(
        "full-history",
        houseToday(context.house.timezone),
      )}"`,
      "cache-control": "no-store",
    },
  });
});
