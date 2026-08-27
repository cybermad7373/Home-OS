import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AnalyticsPanel } from "@/components/analytics/analytics-panel";
import {
  getDailyCost,
  getEffortConcentrationReport,
  getMemberPositionReport,
  getSpendReport,
} from "@/lib/data/analytics";
import { getHouseContext, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; months?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const params = await searchParams;
  const requestedMonths = Number(params.months ?? 6);
  const months = Number.isFinite(requestedMonths) ? requestedMonths : 6;
  const [report, summary, memberPosition, effortConcentration] = await Promise.all([
    getSpendReport(session, context.house, { months }),
    getDailyCost(session, context.house, context.settings, { period: params.period }),
    getMemberPositionReport(session, context.house, { period: params.period }),
    getEffortConcentrationReport(session, context.house, { months }),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={`${context.house.name} · ${monthLabel(summary.period)}`}
      />
      <AnalyticsPanel
        report={report}
        summary={summary}
        memberPosition={memberPosition}
        effortConcentration={effortConcentration}
        currency={context.house.currency}
        months={report.months.length}
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
