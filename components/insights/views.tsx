import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Readout } from "@/components/ui/readout";
import { EmptyState } from "@/components/ui/empty-state";
import { PointsBreakdownButton } from "@/components/chores/points-breakdown";
import { formatMoney } from "@/lib/utils/money";
import type {
  ChoreInsightsOutput,
  FoodInsightsOutput,
  HomeInsightsOutput,
  MoneyInsightsOutput,
} from "@/lib/domain/insights";

/**
 * The four insight views (IN-01 to IN-05), all rendered on one screen.
 *
 * Every chart here is drawn with layout rather than a charting library: bars
 * are `div`s with a height, and each carries a text label. That is what makes
 * "every chart renders at 360 px and is legible in both themes" hold — the
 * figures are readable even when the bars are two pixels tall, and a screen
 * reader gets the numbers rather than an image.
 */

export function BarChart({
  label,
  bars,
}: {
  label: string;
  bars: { key: string; value: number; caption: string }[];
}) {
  const peak = Math.max(...bars.map((bar) => bar.value), 0);

  return (
    <div
      className="mt-3 flex h-32 items-end gap-1.5 overflow-x-auto"
      role="img"
      aria-label={`${label}. ${bars.map((bar) => `${bar.key}: ${bar.caption}`).join(". ")}`}
    >
      {bars.map((bar) => {
        // A zero bar still gets a sliver, so an empty week reads as a week
        // with nothing in it rather than as a gap in the chart.
        const height =
          peak === 0 ? 2 : Math.max(3, Math.round((bar.value / peak) * 100));
        return (
          <div
            key={bar.key}
            className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1"
          >
            <span className="caption-text text-text-muted tabular-nums">
              {bar.caption}
            </span>
            <div className="flex h-20 w-full items-end bg-surface-3">
              <div
                className="w-full bg-primary"
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="caption-text text-text-muted truncate">
              {shortKey(bar.key)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** `2026-08-24` reads as `24 Aug`; `2026-08` reads as `Aug`. */
function shortKey(key: string): string {
  const parts = key.split("-");
  const month = MONTHS[Number(parts[1]) - 1] ?? key;
  return parts.length === 3 ? `${Number(parts[2])} ${month}` : month;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * One figure and what it is. The value is set in the display face, because a
 * metric card exists to be read at a glance and a metric card whose number is
 * the same weight as its label is a paragraph.
 */
function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <p className="eyebrow-text mb-2">{label}</p>
      <Readout value={value} size="md" />
      {hint ? (
        <p className="caption-text mt-1.5 text-text-muted">{hint}</p>
      ) : null}
    </Card>
  );
}

export function MoneyView({
  report,
  currency,
  isPot,
}: {
  report: MoneyInsightsOutput;
  currency: string;
  isPot: boolean;
}) {
  const money = (paise: number) => formatMoney(paise, { currency });

  if (report.totalPaise === 0 && report.pendingPaise === 0) {
    return (
      <EmptyState
        title="Nothing spent in this range"
        body="Once the home records an expense, its spending shows up here."
      />
    );
  }

  return (
    // A column of full-width cards on a phone; two columns of cards on a
    // desktop, with the row of figures spanning both. A 1100px-wide card
    // holding a five-row list is not a card.
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
      {/* Auto-fit rather than a fixed four: a view with two figures should
          fill the row with two, not leave half of it empty. */}
      <div
        className="grid grid-cols-2 gap-3 lg:col-span-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}
      >
        <Metric label="Approved" value={money(report.totalPaise)} />
        <Metric
          label="Waiting on approval"
          value={money(report.pendingPaise)}
          hint={
            report.pendingPaise > 0
              ? "Not counted in any figure below"
              : undefined
          }
        />
      </div>

      <Card>
        <CardTitle>Spending over time</CardTitle>
        <CardDescription>Approved expenses only.</CardDescription>
        <BarChart
          label="Spending over time"
          bars={report.buckets.map((bucket) => ({
            key: bucket.key,
            value: bucket.totalPaise,
            caption: money(bucket.totalPaise),
          }))}
        />
      </Card>

      <Card>
        <CardTitle>By category</CardTitle>
        <ul className="mt-2 flex flex-col gap-2">
          {report.byCategory.map((category) => (
            <li
              key={category.categoryId}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate">{category.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                {/* A signed percentage says which way it moved. Colouring it
                    as well would spend the money colours on a change in
                    spending, and they mean "owes" and "is owed". */}
                {category.changePct === null ? null : (
                  <span className="tabular caption-text text-text-muted">
                    {category.changePct > 0 ? "+" : ""}
                    {category.changePct}%
                  </span>
                )}
                <span className="tabular">{money(category.totalPaise)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Paid against fair share</CardTitle>
        <CardDescription>
          {isPot
            ? "This home shares a pot, so nothing here is a debt."
            : "A positive figure means the home owes them."}
        </CardDescription>
        <ul className="mt-2 flex flex-col gap-2">
          {report.paidVsShare.map((member) => (
            <li
              key={member.memberId}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate">{member.name}</span>
              <span className="shrink-0 tabular-nums">
                {money(member.paidPaise)} of {money(member.fairSharePaise)}
                <span
                  className={
                    member.netPaise >= 0
                      ? "ml-2 text-success"
                      : "ml-2 text-text-muted"
                  }
                >
                  {member.netPaise >= 0 ? "+" : ""}
                  {money(member.netPaise)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {report.owed.length > 0 ? (
        <Card>
          <CardTitle>Who owes whom</CardTitle>
          <CardDescription>
            The fewest payments that settle the range.
          </CardDescription>
          <ul className="mt-2 flex flex-col gap-2">
            {report.owed.map((edge) => (
              <li
                key={`${edge.fromMemberId}-${edge.toMemberId}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate">
                  {edge.fromName} pays {edge.toName}
                </span>
                <span className="shrink-0 tabular-nums">
                  {money(edge.amountPaise)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export function ChoresView({ report }: { report: ChoreInsightsOutput }) {
  if (report.summary.assignedPoints === 0) {
    return (
      <EmptyState
        title="No chores in this range"
        body="Once the home publishes a schedule, the work shows up here."
      />
    );
  }

  return (
    // A column of full-width cards on a phone; two columns of cards on a
    // desktop, with the row of figures spanning both. A 1100px-wide card
    // holding a five-row list is not a card.
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
      {/* Auto-fit rather than a fixed four: a view with two figures should
          fill the row with two, not leave half of it empty. */}
      <div
        className="grid grid-cols-2 gap-3 lg:col-span-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}
      >
        <Metric
          label="Done and confirmed"
          value={`${report.summary.confirmedPoints} pts`}
          hint={
            report.summary.completionRate === null
              ? undefined
              : `${Math.round(report.summary.completionRate * 100)}% of what was scheduled`
          }
        />
        <Metric
          label="Missed"
          value={`${report.summary.missedPoints} pts`}
          hint={
            report.summary.pendingPoints > 0
              ? `${report.summary.pendingPoints} pts still open`
              : undefined
          }
        />
      </div>

      <Card>
        <CardTitle>Work over time</CardTitle>
        <CardDescription>Points confirmed in each period.</CardDescription>
        <BarChart
          label="Points confirmed over time"
          bars={report.buckets.map((bucket) => ({
            key: bucket.key,
            value: bucket.confirmedPoints,
            caption: `${bucket.confirmedPoints}`,
          }))}
        />
      </Card>

      {report.buckets.some((bucket) => bucket.topThreeShare !== null) ? (
        <Card>
          <CardTitle>Effort concentration</CardTitle>
          <CardDescription>
            The share of each period&rsquo;s confirmed points earned by the
            three people who did most. The target is under 45%.
          </CardDescription>
          <ul className="mt-3 flex flex-col gap-2">
            {report.buckets
              .filter((bucket) => bucket.topThreeShare !== null)
              .map((bucket) => {
                const percent = Math.round((bucket.topThreeShare ?? 0) * 100);
                return (
                  <li key={bucket.key} className="flex items-center gap-3">
                    <span className="caption-text w-20 shrink-0 text-text-muted">
                      {bucket.key}
                    </span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={
                          percent > 45
                            ? "block h-full bg-warning"
                            : "block h-full bg-success"
                        }
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="shrink-0 tabular-nums">{percent}%</span>
                  </li>
                );
              })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle>
          {report.ranked ? "Who did what" : "What everybody contributed"}
        </CardTitle>
        {report.ranked && report.summary.topThreeShare !== null ? (
          <CardDescription>
            The top three earned{" "}
            {Math.round(report.summary.topThreeShare * 100)}% of confirmed
            points.
          </CardDescription>
        ) : null}
        <ul className="mt-2 flex flex-col gap-2">
          {report.byMember.map((member) => (
            <li
              key={member.memberId}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate">{member.memberName}</span>
              <span className="shrink-0 tabular-nums">
                {/* EF-12 — the figure opens to the chores behind it. */}
                <PointsBreakdownButton
                  memberId={member.memberId}
                  displayName={member.memberName}
                  points={member.confirmedPoints}
                  from={report.range.from}
                  to={report.range.to}
                />{" "}
                of {member.assignedPoints} pts
                {member.missedPoints > 0 ? (
                  <Badge tone="danger" className="ml-2">
                    {member.missedPoints} missed
                  </Badge>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function FoodView({
  report,
  currency,
}: {
  report: FoodInsightsOutput;
  currency: string;
}) {
  const money = (paise: number) => formatMoney(paise, { currency });

  if (report.homeCookedMeals + report.outsideMeals === 0) {
    return (
      <EmptyState
        title="No meals in this range"
        body="Once the home records what it ate, its food shows up here."
      />
    );
  }

  return (
    // A column of full-width cards on a phone; two columns of cards on a
    // desktop, with the row of figures spanning both. A 1100px-wide card
    // holding a five-row list is not a card.
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
      {/* Auto-fit rather than a fixed four: a view with two figures should
          fill the row with two, not leave half of it empty. */}
      <div
        className="grid grid-cols-2 gap-3 lg:col-span-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}
      >
        <Metric
          label="Cooked at home"
          value={money(report.homeCookedPaise)}
          hint={`${report.homeCookedMeals} meals`}
        />
        <Metric
          label="From outside"
          value={money(report.outsidePaise)}
          hint={`${report.outsideMeals} meals`}
        />
      </div>

      <Card>
        <CardTitle>Food spend over time</CardTitle>
        <BarChart
          label="Food spend over time"
          bars={report.buckets.map((bucket) => ({
            key: bucket.key,
            value: bucket.totalPaise,
            caption: money(bucket.totalPaise),
          }))}
        />
      </Card>

      {report.mostLiked.length > 0 ? (
        <Card>
          <CardTitle>Most liked</CardTitle>
          <CardDescription>
            Ranked on who said they liked it, minus who did not.
          </CardDescription>
          <ul className="mt-2 flex flex-col gap-2">
            {report.mostLiked.map((dish) => (
              <li
                key={dish.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate">{dish.name}</span>
                <span className="caption-text shrink-0 text-text-muted">
                  {dish.likes} liked
                  {dish.dislikes > 0 ? `, ${dish.dislikes} did not` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {report.mostRepeated.length > 0 ? (
        <Card>
          <CardTitle>Most repeated</CardTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {report.mostRepeated.map((dish) => (
              <li
                key={dish.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate">{dish.name}</span>
                <span className="caption-text shrink-0 text-text-muted">
                  {dish.times} times
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Recently eaten</CardTitle>
        <ul className="mt-2 flex flex-col gap-2">
          {report.recent.map((meal) => (
            <li
              key={`${meal.date}-${meal.name}`}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate">{meal.name}</span>
              <span className="caption-text shrink-0 text-text-muted tabular-nums">
                {meal.date} · {money(meal.costPaise)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function HomeView({ report }: { report: HomeInsightsOutput }) {
  return (
    // A column of full-width cards on a phone; two columns of cards on a
    // desktop, with the row of figures spanning both. A 1100px-wide card
    // holding a five-row list is not a card.
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
      {/* Auto-fit rather than a fixed four: a view with two figures should
          fill the row with two, not leave half of it empty. */}
      <div
        className="grid grid-cols-2 gap-3 lg:col-span-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}
      >
        <Metric
          label="Records kept"
          value={String(
            report.activity.expenses +
              report.activity.meals +
              report.activity.choresConfirmed,
          )}
          hint={
            report.activity.recordsPerMember === null
              ? undefined
              : `${report.activity.recordsPerMember} per member`
          }
        />
        <Metric
          label="Decisions"
          value={`${report.decisions.open} open`}
          hint={`${report.decisions.resolved} resolved in this range`}
        />
      </div>

      <Card>
        <CardTitle>How active the home is</CardTitle>
        <ul className="mt-2 flex flex-col gap-2">
          <Row
            label="Expenses recorded"
            value={String(report.activity.expenses)}
          />
          <Row label="Meals recorded" value={String(report.activity.meals)} />
          <Row
            label="Chores confirmed"
            value={String(report.activity.choresConfirmed)}
          />
          <Row
            label="Chores missed"
            value={String(report.activity.choresMissed)}
          />
        </ul>
      </Card>

      {report.imbalance.topThreeShare === null ? (
        // A family Home is shown neither figure, and a house with no confirmed
        // work has nothing to be concentrated (BR-260).
        <Card>
          <CardTitle>How the work falls</CardTitle>
          <CardDescription>
            This home does not measure how evenly its work is shared.
          </CardDescription>
        </Card>
      ) : (
        <Card>
          <CardTitle>How the work falls</CardTitle>
          <CardDescription>
            The share of confirmed points earned by the three people who did
            most.
          </CardDescription>
          <p className="title-text mt-2 tabular-nums">
            {Math.round(report.imbalance.topThreeShare * 100)}%
          </p>
          {report.imbalance.maxDeviationPoints === null ? null : (
            <p className="caption-text text-text-muted">
              Furthest from the average:{" "}
              {Math.round(report.imbalance.maxDeviationPoints)} points.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </li>
  );
}
