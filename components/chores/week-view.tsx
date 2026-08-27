"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { ChoreCard, type ChoreItem } from "./chore-card";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";

/**
 * S-09 — the house week view.
 *
 * A horizontal day selector, seven pills, today highlighted, each showing that
 * day's chore count. Everybody sees everybody's chores: the schedule is the
 * evidence behind the leaderboard, and evidence nobody can inspect is just an
 * assertion.
 */
export function WeekView({
  chores,
  weekDates,
  today,
  timezone,
  myMemberId,
  weekStart,
  previousWeek,
  nextWeek,
}: {
  chores: ChoreItem[];
  weekDates: string[];
  today: string;
  timezone: string;
  myMemberId: string;
  weekStart: string;
  previousWeek: string;
  nextWeek: string;
}) {
  const initial = weekDates.includes(today) ? today : weekDates[0];
  const [selected, setSelected] = useState(initial);

  const countByDate = new Map<string, number>();
  for (const chore of chores) {
    countByDate.set(chore.choreDate, (countByDate.get(chore.choreDate) ?? 0) + 1);
  }

  const forDay = chores.filter((chore) => chore.choreDate === selected);
  const mineThisWeek = chores.filter((chore) => chore.assignee?.memberId === myMemberId);
  const earned = mineThisWeek
    .filter((chore) => chore.status === "confirmed")
    .reduce((sum, chore) => sum + chore.effortPoints, 0);
  const assigned = mineThisWeek.reduce((sum, chore) => sum + chore.effortPoints, 0);

  return (
    <>
      <Card className="mb-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="label-text text-text-muted">Your week</p>
            <p className="display-number">
              {earned}
              <span className="text-text-subtle"> / {assigned}</span>
            </p>
            <p className="caption-text text-text-muted">points confirmed of points assigned</p>
          </div>
          <Link href="/chores/mine" className="caption-text text-primary">
            Just mine →
          </Link>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/chores?week_start=${previousWeek}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Previous
        </Link>
        <span className="caption-text text-text-muted">
          Week of {formatDate(weekStart, timezone, { day: "numeric", month: "long" })}
        </span>
        <Link
          href={`/chores?week_start=${nextWeek}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Next →
        </Link>
      </div>

      <div
        className="mb-4 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Days of the week"
      >
        {weekDates.map((date) => {
          const count = countByDate.get(date) ?? 0;
          const isToday = date === today;
          const isSelected = date === selected;

          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelected(date)}
              className={cn(
                "touch-target flex min-w-[52px] flex-col items-center rounded-[10px] px-2 py-1.5 text-[12px]",
                isSelected
                  ? "bg-primary text-primary-fg"
                  : isToday
                    ? "bg-surface-2 text-primary"
                    : "bg-surface-2 text-text-muted",
              )}
            >
              <span>{formatDate(date, timezone, { weekday: "short" })}</span>
              <span className="text-[15px] font-semibold">
                {formatDate(date, timezone, { day: "numeric" })}
              </span>
              <span className="caption-text">{count === 0 ? "—" : count}</span>
            </button>
          );
        })}
      </div>

      {forDay.length === 0 ? (
        <EmptyState
          title="Nothing on this day"
          body="Either the schedule has not been generated for this week yet, or this really is a free day."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {forDay.map((chore) => (
              <li key={chore.id}>
                <ChoreCard chore={chore} myMemberId={myMemberId} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {chores.some((chore) => chore.status === "open") ? (
        <section className="mt-6">
          <h2 className="heading-text mb-2">
            Nobody assigned
            <Badge tone="warning" className="ml-2">
              {chores.filter((chore) => chore.status === "open").length}
            </Badge>
          </h2>
          <p className="caption-text mb-2 text-text-muted">
            The engine could not find anybody who could legally do these. Better an
            honestly open chore than one assigned to somebody who cannot do it.
          </p>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {chores
                .filter((chore) => chore.status === "open")
                .map((chore) => (
                  <li key={chore.id}>
                    <ChoreCard chore={chore} myMemberId={myMemberId} />
                  </li>
                ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );
}
