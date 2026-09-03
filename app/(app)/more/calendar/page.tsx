import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Readout } from "@/components/ui/readout";
import { List, Section } from "@/components/layout/section";
import { Stepper } from "@/components/layout/stepper";
import { getHouseContext, requireSession } from "@/lib/data/house";
import {
  getCalendarDay,
  getCalendarMonth,
  getCalendarWeek,
} from "@/lib/data/calendar";
import {
  boundsOfMonth,
  weekStartOfDate,
  type DayDensity,
} from "@/lib/domain/home/calendar";
import { presenceLabel } from "@/lib/domain/home/today";
import {
  calendarDateSchema,
  calendarPeriodSchema,
} from "@/lib/validation/calendar";
import {
  CHORE_STATUS_LABEL,
  CHORE_STATUS_TONE,
  type ChoreStatus,
} from "@/lib/types/domain";
import { formatMoney } from "@/lib/utils/money";
import { formatDate, houseToday } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Calendar" };

type View = "day" | "week" | "month";

const VIEWS: { key: View; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/** Monday first, because the house's week starts on a Monday everywhere else. */
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * S-52 — the Calendar. Day, week and month as a segmented control, composed
 * from the other modules; it owns no data of its own.
 *
 * The control is three links rather than a client component: each view is a
 * different server read, and a tab that re-fetches on the server is both
 * simpler and shareable as a URL.
 *
 * The month view is now an actual month. It used to be four summary cards and
 * a points list — a screen labelled "Month" that never drew one, so the only
 * way to find the day something happened on was to step through thirty of
 * them. The grid shades each day by how much of its work got finished and
 * marks the days that cost money, and every cell is a link into the day.
 * `getCalendarMonth` already loaded every chore, meal and expense of the
 * month, so the grid costs no extra query.
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

  const periodResult = calendarPeriodSchema.safeParse(
    params.period ?? today.slice(0, 7),
  );
  const period = periodResult.success ? periodResult.data : today.slice(0, 7);

  const currency = context.house.currency;

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Chores, money, food and decisions, on one timeline"
      />

      <nav aria-label="Calendar view" className="mb-5 max-w-md">
        <ul className="flex gap-1 rounded-full border border-border p-1">
          {VIEWS.map((entry) => (
            <li key={entry.key} className="flex-1">
              <Link
                href={`/more/calendar?view=${entry.key}&date=${date}&period=${period}`}
                aria-current={view === entry.key ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center justify-center rounded-full text-[14px] transition-colors",
                  view === entry.key
                    ? "bg-primary font-medium text-primary-fg"
                    : "text-text-muted hover:text-text",
                )}
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
          today={today}
          currency={currency}
        />
      ) : view === "week" ? (
        <WeekView
          session={session}
          context={context}
          date={date}
          today={today}
          currency={currency}
        />
      ) : (
        <MonthView
          session={session}
          context={context}
          period={period}
          today={today}
          currency={currency}
        />
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

/** Monday = 0. The grid, the week strip and the offset all count from Monday. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * A figure with a label under it, on a hairline grid. Used wherever a view
 * opens with two or three numbers.
 */
function Figures({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border lg:grid-cols-4">
      {children}
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-surface p-4">
      <p className="eyebrow-text mb-3">{label}</p>
      <Readout value={value} size="lg" />
      {note ? (
        <p className="caption-text mt-2 text-text-muted">{note}</p>
      ) : null}
    </div>
  );
}

async function DayView({
  session,
  context,
  date,
  period,
  today,
  currency,
}: {
  session: Session;
  context: Context;
  date: string;
  period: string;
  today: string;
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
        label={
          date === today
            ? "Today"
            : formatDate(date, context.house.timezone, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
        }
      />

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
        <Section
          label={`People · ${presenceLabel(day.presence)}`}
          className="lg:col-span-2"
        >
          {day.presence.away.length > 0 ? (
            <p className="text-[14px] text-text-muted">
              Away:{" "}
              {day.presence.away.map((member) => member.displayName).join(", ")}
            </p>
          ) : (
            <p className="text-[14px] text-text-muted">
              Everybody was in the house.
            </p>
          )}
        </Section>

        {empty ? (
          <div className="mt-6 lg:col-span-2">
            <EmptyState
              title="Nothing recorded"
              body="No chores, no money and no meals on this date."
            />
          </div>
        ) : null}

        {day.chores.length > 0 ? (
          <Section label="Chores" href="/chores">
            <List>
              {day.chores.map((chore) => (
                <li
                  key={chore.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">
                      {chore.name}
                    </span>
                    <span className="caption-text block text-text-muted">
                      {chore.assigneeName ?? "Unassigned"} ·{" "}
                      {chore.effortPoints} pts
                    </span>
                  </span>
                  <Badge
                    tone={
                      CHORE_STATUS_TONE[chore.status as ChoreStatus] ??
                      "neutral"
                    }
                  >
                    {CHORE_STATUS_LABEL[chore.status as ChoreStatus] ??
                      chore.status}
                  </Badge>
                </li>
              ))}
            </List>
          </Section>
        ) : null}

        {day.money.expenses.length > 0 ? (
          <Section
            label={`Money · ${formatMoney(day.money.totalPaise, { currency })}`}
            href="/expenses"
          >
            <List>
              {day.money.expenses.map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0 truncate text-[15px]">
                    {expense.description}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {expense.status === "pending_approval" ? (
                      <span className="eyebrow-text">Unapproved</span>
                    ) : null}
                    <span className="tabular font-medium">
                      {formatMoney(expense.amountPaise, { currency })}
                    </span>
                  </span>
                </li>
              ))}
            </List>
          </Section>
        ) : null}

        {day.food.length > 0 || day.plannedFood.length > 0 ? (
          <Section label="Food" href="/food">
            <List>
              {day.food.map((meal) => (
                <li
                  key={meal.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0 truncate text-[15px]">
                    {meal.name}
                  </span>
                  <span className="tabular shrink-0 text-text-muted">
                    {formatMoney(meal.totalCostPaise, { currency })}
                  </span>
                </li>
              ))}

              {/*
              FD-20 — a plan is an intention, and it is marked as one. Showing
              it the same way as a meal that was eaten would put food in the
              Home's record that nobody ate.
            */}
              {day.plannedFood.map((plan) => (
                <li key={plan.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="eyebrow-text shrink-0">Planned</span>
                  <span className="min-w-0 truncate text-[15px] text-text-muted">
                    {plan.name}
                  </span>
                </li>
              ))}
            </List>
          </Section>
        ) : null}

        {day.pendingDecisions.length > 0 ? (
          <Section label="Waiting on the home" href="/more/approvals">
            <List>
              {day.pendingDecisions.map((decision) => (
                <li key={decision.id}>
                  <Link
                    href={`/more/approvals/${decision.id}`}
                    className={cn(
                      "touch-target relative flex items-center gap-3 py-3 pl-4 pr-3 transition-colors hover:bg-surface-2",
                      decision.level === "critical" &&
                        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent",
                    )}
                  >
                    {decision.level === "critical" ? (
                      <TriangleAlert
                        size={13}
                        className="shrink-0 text-accent"
                        aria-label="Critical"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-[15px]">
                      {decision.label}
                    </span>
                    <ChevronRight
                      size={15}
                      className="shrink-0 text-text-subtle"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </List>
          </Section>
        ) : null}
      </div>
    </>
  );
}

async function WeekView({
  session,
  context,
  date,
  today,
  currency,
}: {
  session: Session;
  context: Context;
  date: string;
  today: string;
  currency: string;
}) {
  const weekStart = weekStartOfDate(date);
  const week = await getCalendarWeek(session, context, weekStart);
  const href = (target: string) => `/more/calendar?view=week&date=${target}`;
  const busiest = Math.max(1, ...week.perDay.map((day) => day.chores));

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

      {/* Seven columns, the same shape as the month grid, so a week and a
          month are read the same way. */}
      <ol className="mb-6 grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border">
        {week.perDay.map((day) => (
          <li key={day.date}>
            <DayCell
              day={day}
              today={today}
              busiest={busiest}
              currency={currency}
              label={day.date.slice(8)}
            />
          </li>
        ))}
      </ol>

      <Figures>
        <Figure
          label="Spent"
          value={formatMoney(week.money.totalPaise, { currency })}
          note={
            week.money.pendingApprovals > 0
              ? `${week.money.pendingApprovals} awaiting approval`
              : "all approved"
          }
        />
        <Figure
          label="Meals"
          value={String(week.mealsLogged)}
          note="logged this week"
        />
      </Figures>

      {week.points.length > 0 ? (
        <Section label="Points" href="/chores/standing">
          <List>
            {week.points.map((row) => (
              <li
                key={row.memberId}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-[15px]">{row.displayName}</span>
                <span className="tabular font-medium">{row.points}</span>
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      <Section label="Day by day">
        <List>
          {week.perDay.map((day) => (
            <li key={day.date}>
              <Link
                href={`/more/calendar?view=day&date=${day.date}`}
                className="touch-target flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="text-[15px]">
                  {formatDate(day.date, context.house.timezone, {
                    weekday: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="caption-text text-text-muted">
                  {day.chores} {day.chores === 1 ? "chore" : "chores"} ·{" "}
                  {day.meals} {day.meals === 1 ? "meal" : "meals"} ·{" "}
                  <span className="tabular">
                    {formatMoney(day.expensePaise, { currency })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </List>
      </Section>
    </>
  );
}

async function MonthView({
  session,
  context,
  period,
  today,
  currency,
}: {
  session: Session;
  context: Context;
  period: string;
  today: string;
  currency: string;
}) {
  const month = await getCalendarMonth(session, context, period);
  const href = (target: string) =>
    `/more/calendar?view=month&period=${target}&date=${boundsOfMonth(target).from}`;

  // Blank cells before the 1st, so the columns line up under their weekday,
  // and after the last day, so the final row is a row of empty cells rather
  // than one wide block of the grid's own background showing through.
  const offset = weekdayIndex(month.dates[0]);
  const trailing = (7 - ((offset + month.dates.length) % 7)) % 7;
  const busiest = Math.max(1, ...month.perDay.map((day) => day.chores));

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

      <div className="mb-6 overflow-hidden rounded-[var(--radius-lg)] border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2">
          {WEEKDAYS.map((day, index) => (
            <div key={index} className="eyebrow-text py-2 text-center">
              {day}
            </div>
          ))}
        </div>
        <ol className="grid grid-cols-7 gap-px bg-border">
          {Array.from({ length: offset }, (_, index) => (
            <li key={`blank-${index}`} className="bg-surface" aria-hidden />
          ))}
          {month.perDay.map((day) => (
            <li key={day.date}>
              <DayCell
                day={day}
                today={today}
                busiest={busiest}
                currency={currency}
                label={String(Number(day.date.slice(8)))}
              />
            </li>
          ))}
          {Array.from({ length: trailing }, (_, index) => (
            <li key={`trail-${index}`} className="bg-surface" aria-hidden />
          ))}
        </ol>
      </div>

      {/* The legend explains the phone's marks. On a desktop the cells say it
          in words, so there is nothing to explain. */}
      <p className="caption-text mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-text-subtle lg:hidden">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-4 bg-text" />
          chores finished
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-text" />
          money spent
        </span>
      </p>

      <Figures>
        <Figure
          label="Spent"
          value={formatMoney(month.money.totalPaise, { currency })}
          note={
            month.money.pendingApprovals > 0
              ? `${month.money.pendingApprovals} awaiting approval`
              : "all approved"
          }
        />
        <Figure
          label="Chores done"
          value={
            month.completion.rate === null
              ? "—"
              : `${Math.round(month.completion.rate * 100)}%`
          }
          note={
            month.completion.rate === null
              ? "nothing was scheduled"
              : `${month.completion.confirmed} of ${month.completion.total} confirmed`
          }
        />
      </Figures>

      <Section label="Food" href="/food/history" linkLabel="History">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <p className="text-[15px]">
            {month.mealsLogged} {month.mealsLogged === 1 ? "meal" : "meals"}{" "}
            logged
          </p>
          <p className="caption-text mt-1 text-text-muted">
            <span className="tabular">
              {formatMoney(month.mealSpend.homeCookedPaise, { currency })}
            </span>{" "}
            cooked at home ·{" "}
            <span className="tabular">
              {formatMoney(month.mealSpend.outsidePaise, { currency })}
            </span>{" "}
            from outside
          </p>
        </div>
      </Section>

      {month.points.length > 0 ? (
        <Section label="Points" href="/chores/standing">
          <List>
            {month.points.map((row) => (
              <li
                key={row.memberId}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-[15px]">{row.displayName}</span>
                <span className="tabular font-medium">{row.points}</span>
              </li>
            ))}
          </List>
        </Section>
      ) : null}
    </>
  );
}

/**
 * One day in a grid.
 *
 * A cell is small — a seventh of a phone — so it carries three facts and no
 * more: the date, how much of the day's work got finished, and whether the day
 * cost anything. The bar is the finished share of that day's chores, scaled
 * against the busiest day of the range so a quiet week does not look like an
 * empty one. Everything else is a tap away in the day view.
 */
function DayCell({
  day,
  today,
  busiest,
  label,
  currency,
}: {
  day: DayDensity;
  today: string;
  busiest: number;
  label: string;
  currency?: string;
}) {
  const share = day.chores > 0 ? day.choresDone / day.chores : 0;
  const height = Math.round((day.chores / busiest) * 100);
  const isToday = day.date === today;

  return (
    <Link
      href={`/more/calendar?view=day&date=${day.date}`}
      aria-label={`${day.date}: ${day.chores} chores, ${day.choresDone} done, ${day.meals} meals`}
      className={cn(
        "flex aspect-square flex-col items-center justify-between bg-surface px-1 py-1.5 transition-colors hover:bg-surface-2",
        // On a desktop a square cell is 150px of mostly nothing, so the cell
        // stops being square and starts saying what happened in words.
        "lg:aspect-auto lg:h-[104px] lg:items-stretch lg:px-2.5 lg:py-2",
        isToday && "bg-surface-2",
      )}
    >
      <span
        className={cn(
          "readout text-[12px] leading-none lg:text-[13px]",
          isToday ? "text-text" : "text-text-muted",
        )}
      >
        {label}
      </span>

      {/* The bar is the phone's whole vocabulary; on a desktop it is a rule
          under two lines of plain text. */}
      <span
        aria-hidden
        className="flex h-full w-full items-end justify-center pb-0.5 lg:hidden"
      >
        {day.chores > 0 ? (
          <span
            className="flex w-3 items-end bg-surface-3"
            style={{ height: `${Math.max(height, 12)}%` }}
          >
            <span className="block w-full bg-text" style={{ height: `${share * 100}%` }} />
          </span>
        ) : null}
      </span>

      <span aria-hidden className="flex h-1.5 items-center gap-0.5 lg:hidden">
        {day.expensePaise > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-text" /> : null}
        {day.meals > 0 ? (
          <span className="h-1.5 w-1.5 rounded-full border border-border-strong" />
        ) : null}
      </span>

      <span aria-hidden className="mt-auto hidden flex-col gap-1 lg:flex">
        {day.chores > 0 ? (
          <>
            <span className="caption-text text-text-muted">
              <span className="tabular text-text">{day.choresDone}</span>/{day.chores} done
            </span>
            <span className="flex h-[3px] w-full bg-surface-3">
              <span className="block bg-text" style={{ width: `${share * 100}%` }} />
            </span>
          </>
        ) : null}
        {day.expensePaise > 0 ? (
          <span className="caption-text tabular truncate text-text-muted">
            {formatMoney(day.expensePaise, { currency: currency ?? "INR" })}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
