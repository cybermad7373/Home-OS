import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getCalendarDay, getCalendarMonth, getCalendarWeek } from "@/lib/data/calendar";
import { boundsOfMonth, weekStartOfDate } from "@/lib/domain/home/calendar";
import { presenceLabel } from "@/lib/domain/home/today";
import { calendarDateSchema, calendarPeriodSchema } from "@/lib/validation/calendar";
import { formatMoney } from "@/lib/utils/money";
import { formatDate, houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Calendar" };

type View = "day" | "week" | "month";

const VIEWS: { key: View; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  confirmed: "success",
  done_pending: "warning",
  rejected: "danger",
  missed: "danger",
};

/**
 * S-52 — the Calendar. Day, week and month as a segmented control, composed
 * from the other modules; it owns no data of its own.
 *
 * The control is three links rather than a client component: each view is a
 * different server read, and a tab that re-fetches on the server is both
 * simpler and shareable as a URL.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; period?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const params = await searchParams;

  const today = houseToday(context.house.timezone);
  const view: View = VIEWS.some((entry) => entry.key === params.view)
    ? (params.view as View)
    : "day";

  // A malformed date in the URL falls back to today rather than erroring: the
  // Calendar is a read, and a typed URL is not worth a 422 screen.
  const dateResult = calendarDateSchema.safeParse(params.date ?? today);
  const date = dateResult.success ? dateResult.data : today;

  const periodResult = calendarPeriodSchema.safeParse(params.period ?? today.slice(0, 7));
  const period = periodResult.success ? periodResult.data : today.slice(0, 7);

  const currency = context.house.currency;

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Chores, money, food and decisions, on one timeline"
      />

      <nav aria-label="Calendar view" className="mb-4">
        <ul className="flex gap-1 rounded-[10px] bg-surface-2 p-1">
          {VIEWS.map((entry) => (
            <li key={entry.key} className="flex-1">
              <Link
                href={`/more/calendar?view=${entry.key}&date=${date}&period=${period}`}
                aria-current={view === entry.key ? "page" : undefined}
                className={
                  view === entry.key
                    ? "touch-target flex items-center justify-center rounded-[8px] bg-surface text-[15px] font-medium text-primary"
                    : "touch-target flex items-center justify-center rounded-[8px] text-[15px] text-text-muted"
                }
              >
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {view === "day" ? (
        <DayView
          session={session}
          context={context}
          date={date}
          period={period}
          currency={currency}
        />
      ) : view === "week" ? (
        <WeekView session={session} context={context} date={date} currency={currency} />
      ) : (
        <MonthView session={session} context={context} period={period} currency={currency} />
      )}
    </>
  );
}

type Session = Awaited<ReturnType<typeof requireSession>>;
type Context = Awaited<ReturnType<typeof getHouseContext>>;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  const shifted = month + months;
  const shiftYear = year + Math.floor((shifted - 1) / 12);
  const shiftMonth = ((((shifted - 1) % 12) + 12) % 12) + 1;
  return `${shiftYear}-${String(shiftMonth).padStart(2, "0")}`;
}

function Stepper({
  back,
  forward,
  label,
}: {
  back: string;
  forward: string;
  label: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <Link className="caption-text touch-target text-primary" href={back}>
        ← Earlier
      </Link>
      <span className="text-[15px] font-medium">{label}</span>
      <Link className="caption-text touch-target text-primary" href={forward}>
        Later →
      </Link>
    </div>
  );
}

async function DayView({
  session,
  context,
  date,
  period,
  currency,
}: {
  session: Session;
  context: Context;
  date: string;
  period: string;
  currency: string;
}) {
  const day = await getCalendarDay(session, context, date);
  const href = (target: string) =>
    `/more/calendar?view=day&date=${target}&period=${period}`;

  const empty =
    day.chores.length === 0 &&
    day.money.expenses.length === 0 &&
    day.food.length === 0 &&
    day.plannedFood.length === 0 &&
    day.pendingDecisions.length === 0;

  return (
    <>
      <Stepper
        back={href(shiftDate(date, -1))}
        forward={href(shiftDate(date, 1))}
        label={formatDate(date, context.house.timezone, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}
      />

      <Card className="mb-3">
        <CardTitle>People</CardTitle>
        <CardDescription>{presenceLabel(day.presence)}</CardDescription>
        {day.presence.away.length > 0 ? (
          <p className="caption-text mt-1 text-text-muted">
            Away: {day.presence.away.map((member) => member.displayName).join(", ")}
          </p>
        ) : null}
      </Card>

      {empty ? (
        <EmptyState
          title="Nothing recorded"
          body="No chores, no money and no meals on this date."
        />
      ) : null}

      {day.chores.length > 0 ? (
        <Card className="mb-3 p-0">
          <div className="px-4 pt-4">
            <CardTitle>Chores</CardTitle>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {day.chores.map((chore) => (
              <li key={chore.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{chore.name}</span>
                  <span className="caption-text block text-text-muted">
                    {chore.assigneeName ?? "Unassigned"} · {chore.effortPoints} pts
                  </span>
                </span>
                <Badge tone={STATUS_TONE[chore.status] ?? "neutral"}>
                  {chore.status.replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {day.money.expenses.length > 0 ? (
        <Card className="mb-3 p-0">
          <div className="flex items-baseline justify-between px-4 pt-4">
            <CardTitle>Money</CardTitle>
            <span className="font-medium tabular-nums">
              {formatMoney(day.money.totalPaise, { currency })}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {day.money.expenses.map((expense) => (
              <li key={expense.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate text-[15px]">{expense.description}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {expense.status === "pending_approval" ? (
                    <Badge tone="warning">pending</Badge>
                  ) : null}
                  <span className="font-medium tabular-nums">
                    {formatMoney(expense.amountPaise, { currency })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {day.food.length > 0 || day.plannedFood.length > 0 ? (
        <Card className="mb-3">
          <CardTitle>Food</CardTitle>
          {day.food.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {day.food.map((meal) => (
                <li key={meal.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px]">{meal.name}</span>
                  <span className="caption-text shrink-0 text-text-muted">
                    {formatMoney(meal.totalCostPaise, { currency })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/*
            FD-20 — a plan is an intention, and it is marked as one. Showing it
            the same way as a meal that was eaten would put food in the Home's
            record that nobody ate.
          */}
          {day.plannedFood.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {day.plannedFood.map((plan) => (
                <li key={plan.id} className="flex items-center gap-2">
                  <Badge tone="info">planned</Badge>
                  <span className="min-w-0 truncate text-[15px] italic text-text-muted">
                    {plan.name}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {day.pendingDecisions.length > 0 ? (
        <Card className="p-0">
          <div className="px-4 pt-4">
            <CardTitle>Waiting on the home</CardTitle>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {day.pendingDecisions.map((decision) => (
              <li key={decision.id}>
                <Link
                  href={`/more/approvals/${decision.id}`}
                  className="touch-target flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate text-[15px]">
                    {decision.level === "critical" ? (
                      <span className="text-danger">⚠ </span>
                    ) : null}
                    {decision.label}
                  </span>
                  <span aria-hidden className="caption-text shrink-0 text-primary">
                    Review →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

async function WeekView({
  session,
  context,
  date,
  currency,
}: {
  session: Session;
  context: Context;
  date: string;
  currency: string;
}) {
  const weekStart = weekStartOfDate(date);
  const week = await getCalendarWeek(session, context, weekStart);
  const href = (target: string) => `/more/calendar?view=week&date=${target}`;

  return (
    <>
      <Stepper
        back={href(shiftDate(weekStart, -7))}
        forward={href(shiftDate(weekStart, 7))}
        label={`Week of ${formatDate(weekStart, context.house.timezone, {
          day: "numeric",
          month: "short",
        })}`}
      />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Card>
          <CardTitle>Spent</CardTitle>
          <p className="display-number mt-2">
            {formatMoney(week.money.totalPaise, { currency })}
          </p>
          <CardDescription>
            {week.money.pendingApprovals > 0
              ? `${week.money.pendingApprovals} awaiting approval`
              : "all approved"}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Meals</CardTitle>
          <p className="display-number mt-2">{week.mealsLogged}</p>
          <CardDescription>logged this week</CardDescription>
        </Card>
      </div>

      {week.points.length > 0 ? (
        <Card className="mb-3 p-0">
          <div className="px-4 pt-4">
            <CardTitle>Points</CardTitle>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {week.points.map((row) => (
              <li key={row.memberId} className="flex items-center justify-between px-4 py-3">
                <span className="text-[15px]">{row.displayName}</span>
                <span className="font-medium tabular-nums">{row.points}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-0">
        <div className="px-4 pt-4">
          <CardTitle>The week</CardTitle>
        </div>
        <ul className="mt-2 divide-y divide-border">
          {week.perDay.map((day) => (
            <li key={day.date}>
              <Link
                href={`/more/calendar?view=day&date=${day.date}`}
                className="touch-target flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <span className="text-[15px]">
                  {formatDate(day.date, context.house.timezone, {
                    weekday: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="caption-text text-text-muted">
                  {day.chores} {day.chores === 1 ? "chore" : "chores"} · {day.meals}{" "}
                  {day.meals === 1 ? "meal" : "meals"} ·{" "}
                  {formatMoney(day.expensePaise, { currency })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

async function MonthView({
  session,
  context,
  period,
  currency,
}: {
  session: Session;
  context: Context;
  period: string;
  currency: string;
}) {
  const month = await getCalendarMonth(session, context, period);
  const href = (target: string) =>
    `/more/calendar?view=month&period=${target}&date=${boundsOfMonth(target).from}`;

  return (
    <>
      <Stepper
        back={href(shiftPeriod(period, -1))}
        forward={href(shiftPeriod(period, 1))}
        label={formatDate(`${period}-01`, context.house.timezone, {
          month: "long",
          year: "numeric",
        })}
      />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Card>
          <CardTitle>Spent</CardTitle>
          <p className="display-number mt-2">
            {formatMoney(month.money.totalPaise, { currency })}
          </p>
          <CardDescription>
            {month.money.pendingApprovals > 0
              ? `${month.money.pendingApprovals} awaiting approval`
              : "all approved"}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Chores done</CardTitle>
          <p className="display-number mt-2">
            {month.completion.rate === null
              ? "—"
              : `${Math.round(month.completion.rate * 100)}%`}
          </p>
          <CardDescription>
            {month.completion.rate === null
              ? "nothing was scheduled"
              : `${month.completion.confirmed} of ${month.completion.total} confirmed`}
          </CardDescription>
        </Card>
      </div>

      <Card className="mb-3">
        <CardTitle>Food</CardTitle>
        <p className="mt-2 text-[15px]">
          {month.mealsLogged} {month.mealsLogged === 1 ? "meal" : "meals"} logged
        </p>
        <CardDescription className="mt-1">
          {formatMoney(month.mealSpend.homeCookedPaise, { currency })} cooked at home ·{" "}
          {formatMoney(month.mealSpend.outsidePaise, { currency })} from outside
        </CardDescription>
      </Card>

      {month.points.length > 0 ? (
        <Card className="p-0">
          <div className="px-4 pt-4">
            <CardTitle>Points</CardTitle>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {month.points.map((row) => (
              <li key={row.memberId} className="flex items-center justify-between px-4 py-3">
                <span className="text-[15px]">{row.displayName}</span>
                <span className="font-medium tabular-nums">{row.points}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
