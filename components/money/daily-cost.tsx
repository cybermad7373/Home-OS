import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import type {
  BudgetVerdict,
  CategorySpend,
  DailyCostSummary,
} from "@/lib/domain/analytics/daily-cost";

/**
 * What the house costs to run.
 *
 * The headline is the daily average, not the month-to-date total, because the
 * total is a number nobody can act on until the month is over. A rate is
 * something you can change on the way to the shop.
 */
export function DailyCostPanel({
  summary,
  currency,
  showPerHead,
}: {
  summary: DailyCostSummary;
  currency: string;
  /**
   * Per-head figures make sense where the cost divides between people. In a
   * family home the house pays as one, and "₹412 each" is a number nobody has
   * a use for.
   */
  showPerHead: boolean;
}) {
  const money = (paise: number) => formatMoney(paise, { currency });
  const trend = summary.last7AveragePaise - summary.averagePerDayPaise;

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription>Costing you, per day</CardDescription>
            <p className="mt-0.5 text-[32px] font-semibold leading-tight tabular-nums">
              {money(summary.averagePerDayPaise)}
            </p>
            {showPerHead ? (
              <p className="caption-text text-text-muted">
                {money(summary.averagePerDayPerHeadPaise)} each
              </p>
            ) : null}
          </div>
          <VerdictBadge
            verdict={summary.budgetVerdict}
            dailyBudgetPaise={summary.dailyBudgetPaise}
            currency={currency}
          />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
          <Stat label="Today" value={money(summary.todayPaise)} />
          <Stat label="This month" value={money(summary.monthToDatePaise)} />
          <Stat
            label="On track for"
            value={money(summary.projectedMonthPaise)}
            hint={`${summary.daysElapsed} of ${summary.daysInMonth} days`}
          />
        </dl>

        {summary.monthToDatePaise > 0 ? (
          <p className="caption-text mt-3 text-text-muted">
            {trend > 0
              ? `The last seven days are running ${money(trend)} a day above the month's average.`
              : trend < 0
                ? `The last seven days are running ${money(-trend)} a day below the month's average.`
                : "The last seven days are running level with the month's average."}
          </p>
        ) : null}
      </Card>

      <SpendChart summary={summary} currency={currency} />

      <Card>
        <CardTitle>Where it went</CardTitle>
        {summary.categories.some((row) => row.spentPaise > 0) ? (
          <ul className="mt-3 flex flex-col gap-3">
            {summary.categories
              .filter((row) => row.spentPaise > 0 || row.budgetPaise !== null)
              .map((row) => (
                <CategoryRow key={row.categoryId} row={row} currency={currency} />
              ))}
          </ul>
        ) : (
          <CardDescription className="mt-2">
            Nothing logged this month yet.{" "}
            <Link href="/expenses?add=1" className="text-primary underline">
              Add the first expense
            </Link>
            .
          </CardDescription>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="caption-text text-text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
      {hint ? <p className="caption-text text-text-muted">{hint}</p> : null}
    </div>
  );
}

const VERDICT: Record<
  Exclude<BudgetVerdict, "none">,
  { tone: "success" | "warning" | "danger"; label: string }
> = {
  under: { tone: "success", label: "Under budget" },
  close: { tone: "warning", label: "Near budget" },
  over: { tone: "danger", label: "Over budget" },
};

function VerdictBadge({
  verdict,
  dailyBudgetPaise,
  currency,
}: {
  verdict: BudgetVerdict;
  dailyBudgetPaise: number | null;
  currency: string;
}) {
  if (verdict === "none" || dailyBudgetPaise === null) {
    return (
      <Link href="/admin/settings" className="caption-text text-primary underline">
        Set a daily budget
      </Link>
    );
  }

  const { tone, label } = VERDICT[verdict];
  return (
    <div className="text-right">
      <Badge tone={tone}>{label}</Badge>
      <p className="caption-text mt-1 text-text-muted">
        Target {formatMoney(dailyBudgetPaise, { currency })}
      </p>
    </div>
  );
}

/**
 * A bar per day. Deliberately not a library: thirty-one divs whose heights are
 * a percentage of the biggest day render instantly, work without JavaScript,
 * and cost nothing on a mid-range Android.
 */
function SpendChart({
  summary,
  currency,
}: {
  summary: DailyCostSummary;
  currency: string;
}) {
  const peak = summary.biggestDay?.amountPaise ?? 0;
  if (peak === 0) return null;

  return (
    <Card>
      <CardTitle>Day by day</CardTitle>
      <CardDescription>
        Biggest day was {formatMoney(peak, { currency })} on{" "}
        {dayLabel(summary.biggestDay!.date)}.
      </CardDescription>

      <div
        className="mt-3 flex h-28 items-end gap-[3px]"
        role="img"
        aria-label={`Daily spending for the month. ${summary.series
          .filter((day) => day.amountPaise > 0)
          .map((day) => `${dayLabel(day.date)}: ${formatMoney(day.amountPaise, { currency })}`)
          .join(". ")}`}
      >
        {summary.series.map((day) => {
          const height = Math.max(2, Math.round((day.amountPaise / peak) * 100));
          const overBudget =
            summary.dailyBudgetPaise !== null &&
            day.amountPaise > summary.dailyBudgetPaise;
          return (
            <div
              key={day.date}
              className="flex-1 rounded-t-[2px]"
              style={{ height: `${height}%` }}
              // The bars carry a title for a pointer and are summarised in the
              // group's aria-label for a screen reader; neither is the only way
              // to reach the numbers, which are also in the list below.
              title={`${dayLabel(day.date)} — ${formatMoney(day.amountPaise, { currency })}`}
            >
              <div
                className={cn(
                  "h-full w-full rounded-t-[2px]",
                  day.amountPaise === 0
                    ? "bg-surface-2"
                    : overBudget
                      ? "bg-danger"
                      : "bg-primary",
                )}
              />
            </div>
          );
        })}
      </div>

      <div className="caption-text mt-1 flex justify-between text-text-muted">
        <span>{dayLabel(summary.series[0].date)}</span>
        <span>{dayLabel(summary.series[summary.series.length - 1].date)}</span>
      </div>
    </Card>
  );
}

function CategoryRow({ row, currency }: { row: CategorySpend; currency: string }) {
  const fraction = row.fractionUsed === null ? null : Math.min(1, row.fractionUsed);

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">
          {row.icon ? <span aria-hidden>{row.icon} </span> : null}
          {row.name}
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {formatMoney(row.spentPaise, { currency })}
        </span>
      </div>

      {row.budgetPaise !== null ? (
        <>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={row.budgetPaise}
            aria-valuenow={row.spentPaise}
            aria-label={`${row.name} budget`}
          >
            <div
              className={cn("h-full rounded-full", row.over ? "bg-danger" : "bg-primary")}
              style={{ width: `${Math.round((fraction ?? 0) * 100)}%` }}
            />
          </div>
          <p className="caption-text mt-0.5 text-text-muted">
            {row.over
              ? `${formatMoney(row.spentPaise - row.budgetPaise, { currency })} over the ${formatMoney(row.budgetPaise, { currency })} budget`
              : `${formatMoney(row.budgetPaise - row.spentPaise, { currency })} left of ${formatMoney(row.budgetPaise, { currency })}`}
          </p>
        </>
      ) : null}
    </li>
  );
}

function dayLabel(date: string): string {
  return String(Number(date.slice(8, 10)));
}
