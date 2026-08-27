import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ExportCard } from "./export-card";
import type { DailyCostSummary } from "@/lib/domain/analytics/daily-cost";
import type {
  EffortConcentrationReport,
  MemberPositionReport,
  SpendReport,
} from "@/lib/domain/analytics/report";
import { formatMoney } from "@/lib/utils/money";

export function AnalyticsPanel({
  report,
  summary,
  memberPosition,
  effortConcentration,
  currency,
  months,
}: {
  report: SpendReport;
  summary: DailyCostSummary & { period: string };
  memberPosition: MemberPositionReport;
  effortConcentration: EffortConcentrationReport;
  currency: string;
  months: number;
}) {
  const money = (paise: number) => formatMoney(paise, { currency });
  const peak = Math.max(...report.totals, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="This month" value={money(summary.monthToDatePaise)} />
        <Metric label="Projected month" value={money(summary.projectedMonthPaise)} />
      </div>

      <Card>
        <CardTitle>Monthly spend</CardTitle>
        <CardDescription>Approved expenses over the last {report.months.length} months.</CardDescription>
        <div
          className="mt-4 flex h-36 items-end gap-2"
          role="img"
          aria-label={report.months
            .map((month, index) => `${month}: ${money(report.totals[index])}`)
            .join(". ")}
        >
          {report.months.map((month, index) => {
            const total = report.totals[index];
            const height = peak === 0 ? 2 : Math.max(3, Math.round((total / peak) * 100));
            return (
              <div key={month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="caption-text text-text-muted tabular-nums">{money(total)}</span>
                <div className="flex h-24 w-full items-end rounded-t-[4px] bg-surface-2">
                  <div
                    className="w-full rounded-t-[4px] bg-primary"
                    style={{ height: `${height}%` }}
                    title={`${month}: ${money(total)}`}
                  />
                </div>
                <span className="caption-text text-text-muted">{monthLabel(month)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Effort concentration</CardTitle>
        <CardDescription>Share of confirmed points earned by the top three</CardDescription>
        <div
          className="mt-4 flex h-32 items-end gap-2"
          role="img"
          aria-label={effortConcentration.history
            .map((row) => `${row.month}: ${Math.round(row.concentrationRatio * 100)}%`)
            .join(". ")}
        >
          {effortConcentration.history.map((row) => {
            const percent = Math.round(row.concentrationRatio * 100);
            return (
              <div key={row.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="caption-text text-text-muted tabular-nums">{percent}%</span>
                <div className="flex h-20 w-full items-end rounded-t-[4px] bg-surface-2">
                  <div
                    className="w-full rounded-t-[4px] bg-primary"
                    style={{ height: `${Math.max(percent === 0 ? 2 : 3, percent)}%` }}
                    title={`${row.month}: ${percent}%`}
                  />
                </div>
                <span className="caption-text text-text-muted">{monthLabel(row.month)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Where it goes</CardTitle>
        <CardDescription>Categories ranked by the most recent month.</CardDescription>
        {report.categories.length === 0 ? (
          <p className="caption-text mt-3 text-text-muted">No approved expenses in this range.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {report.categories.map((category) => {
              const recent = category.totals.at(-1) ?? 0;
              const width = peak === 0 ? 0 : Math.round((recent / peak) * 100);
              return (
                <li key={category.categoryId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{category.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">{money(recent)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Budget status</CardTitle>
            <CardDescription>{monthLabel(summary.period)} month to date</CardDescription>
          </div>
          <BudgetBadge verdict={summary.budgetVerdict} />
        </div>
        <ul className="mt-4 flex flex-col gap-4">
          {summary.categories.filter((category) => category.budgetPaise !== null).map((category) => {
            const budget = category.budgetPaise ?? 0;
            const width = budget > 0 ? Math.min(100, Math.round((category.spentPaise / budget) * 100)) : 0;
            return (
              <li key={category.categoryId}>
                <div className="flex items-baseline justify-between gap-3">
                  <span>{category.name}</span>
                  <span className="caption-text tabular-nums">
                    {money(category.spentPaise)} / {money(budget)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={category.over ? "h-full rounded-full bg-danger" : "h-full rounded-full bg-primary"} style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle>Paid vs fair share</CardTitle>
        <CardDescription>{monthLabel(memberPosition.period)} approved spending</CardDescription>
        {memberPosition.members.length === 0 ? (
          <p className="caption-text mt-3 text-text-muted">No members in this period.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {memberPosition.members.map((member) => (
              <li key={member.memberId} className="rounded-[4px] bg-surface-2 px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{member.displayName}</span>
                  <span
                    className={member.netPaise < 0 ? "caption-text shrink-0 text-danger tabular-nums" : "caption-text shrink-0 text-success tabular-nums"}
                  >
                    Net {money(member.netPaise)}
                  </span>
                </div>
                <p className="caption-text mt-1 text-text-muted tabular-nums">
                  Paid {money(member.paidPaise)} · Fair share {money(member.fairSharePaise)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ExportCard period={summary.period} months={months} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardDescription>{label}</CardDescription>
      <p className="mt-1 text-[22px] font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

function BudgetBadge({ verdict }: { verdict: DailyCostSummary["budgetVerdict"] }) {
  if (verdict === "none") return <Badge tone="neutral">No daily target</Badge>;
  if (verdict === "over") return <Badge tone="danger">Over target</Badge>;
  if (verdict === "close") return <Badge tone="warning">Near target</Badge>;
  return <Badge tone="success">Under target</Badge>;
}

function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
