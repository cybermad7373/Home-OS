"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Readout } from "@/components/ui/readout";
import { Columns } from "@/components/layout/columns";
import { List, Section } from "@/components/layout/section";
import { Stepper } from "@/components/layout/stepper";
import { ChoreCard, type ChoreItem } from "./chore-card";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";

/**
 * S-09 — the house week view.
 *
 * Everybody sees everybody's chores: the schedule is the evidence behind the
 * leaderboard, and evidence nobody can inspect is just an assertion.
 *
 * The day selector is the same seven-column grid the Calendar draws, with the
 * same bar for how much of a day's work is finished, so a week reads the same
 * way wherever you meet one. It used to be seven pills of a different shape,
 * a different size and a different colour language, sitting under a stepper
 * built out of ghost buttons reading "← Previous".
 */
export function WeekView({
  chores,
  weekDates,
  today,
  timezone,
  myMemberId,
  houseId,
  weekStart,
  previousWeek,
  nextWeek,
}: {
  chores: ChoreItem[];
  weekDates: string[];
  today: string;
  timezone: string;
  myMemberId: string;
  houseId: string;
  weekStart: string;
  previousWeek: string;
  nextWeek: string;
}) {
  const initial = weekDates.includes(today) ? today : weekDates[0];
  const [selected, setSelected] = useState(initial);

  const byDate = new Map<string, { total: number; done: number }>(
    weekDates.map((date) => [date, { total: 0, done: 0 }]),
  );
  for (const chore of chores) {
    const day = byDate.get(chore.choreDate);
    if (!day) continue;
    day.total += 1;
    if (chore.status === "confirmed") day.done += 1;
  }
  const busiest = Math.max(1, ...[...byDate.values()].map((day) => day.total));

  const forDay = chores.filter((chore) => chore.choreDate === selected);
  const open = chores.filter((chore) => chore.status === "open");
  const mineThisWeek = chores.filter(
    (chore) => chore.assignee?.memberId === myMemberId,
  );
  const earned = mineThisWeek
    .filter((chore) => chore.status === "confirmed")
    .reduce((sum, chore) => sum + chore.effortPoints, 0);
  const assigned = mineThisWeek.reduce(
    (sum, chore) => sum + chore.effortPoints,
    0,
  );

  const dayList =
    forDay.length === 0 ? (
      <EmptyState
        title="Nothing on this day"
        body="Either the schedule has not been generated for this week yet, or this really is a free day."
      />
    ) : (
      <List>
        {forDay.map((chore) => (
          <li key={chore.id}>
            <ChoreCard
              chore={chore}
              myMemberId={myMemberId}
              houseId={houseId}
            />
          </li>
        ))}
      </List>
    );

  return (
    <>
      <Link
        href="/chores/mine"
        className="group mb-6 flex items-end justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:bg-surface-2 lg:max-w-sm"
      >
        <span>
          <span className="eyebrow-text mb-3 block">Your week</span>
          <span className="flex items-baseline gap-2">
            <Readout value={String(earned)} size="xl" />
            <span className="readout text-[20px] leading-none text-text-subtle">
              /{assigned}
            </span>
          </span>
          <span className="caption-text mt-2 block text-text-muted">
            points confirmed of points assigned
          </span>
        </span>
        <ArrowUpRight
          size={15}
          className="magnetic-icon shrink-0 text-text-subtle"
          aria-hidden
        />
      </Link>

      <Stepper
        back={`/chores?week_start=${previousWeek}`}
        forward={`/chores?week_start=${nextWeek}`}
        backLabel="The week before"
        forwardLabel="The week after"
        label={`Week of ${formatDate(weekStart, timezone, { day: "numeric", month: "long" })}`}
      />

      <div
        className="mb-6 grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border"
        role="tablist"
        aria-label="Days of the week"
      >
        {weekDates.map((date) => {
          const day = byDate.get(date) ?? { total: 0, done: 0 };
          const isToday = date === today;
          const isSelected = date === selected;
          const share = day.total > 0 ? day.done / day.total : 0;

          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelected(date)}
              className={cn(
                "flex flex-col items-center gap-1 px-1 py-2 transition-colors",
                isSelected
                  ? "bg-primary text-primary-fg"
                  : isToday
                    ? "bg-surface-2 text-text"
                    : "bg-surface text-text-muted hover:bg-surface-2",
              )}
            >
              <span className="eyebrow-text text-current opacity-70">
                {formatDate(date, timezone, { weekday: "short" }).slice(0, 1)}
              </span>
              <span className="readout text-[15px] leading-none">
                {formatDate(date, timezone, { day: "numeric" })}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex w-3 items-end",
                  isSelected ? "bg-primary-fg/25" : "bg-surface-3",
                  day.total === 0 && "opacity-0",
                )}
                style={{
                  height: `${Math.max(20, (day.total / busiest) * 20)}px`,
                }}
              >
                <span
                  className={cn(
                    "block w-full",
                    isSelected ? "bg-primary-fg" : "bg-text",
                  )}
                  style={{ height: `${share * 100}%` }}
                />
              </span>
              <span className="sr-only">
                {day.total} chores, {day.done} done
              </span>
            </button>
          );
        })}
      </div>

      {/* The day being read is the main column. What nobody is holding is
          beside it, where an admin can see it without losing their place. */}
      {open.length > 0 ? (
        <Columns
          main={dayList}
          aside={
            <Section
              label={`Nobody assigned · ${open.length}`}
              className="mt-0"
            >
              <p className="caption-text mb-3 text-text-muted">
                The engine could not find anybody who could legally do these.
                Better an honestly open chore than one assigned to somebody who
                cannot do it.
              </p>
              <List>
                {open.map((chore) => (
                  <li key={chore.id}>
                    <ChoreCard
                      chore={chore}
                      myMemberId={myMemberId}
                      houseId={houseId}
                    />
                  </li>
                ))}
              </List>
            </Section>
          }
        />
      ) : (
        dayList
      )}
    </>
  );
}
