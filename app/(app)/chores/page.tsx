import type { Metadata } from "next";
import Link from "next/link";
import { WeekView } from "@/components/chores/week-view";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { getHouseContext, requireSession } from "@/lib/data/house";
import {
  listAssignments,
  listAwaitingConfirmation,
  listTemplates,
  weekStartOf,
} from "@/lib/data/chores";
import { weekDates } from "@/lib/domain/scheduling/capacity";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Chores" };

function shiftWeek(weekStart: string, weeks: number): string {
  const date = new Date(`${weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

export default async function ChoresPage({
  searchParams,
}: {
  searchParams: Promise<{ week_start?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const { week_start: requested } = await searchParams;

  const today = houseToday(context.house.timezone);
  const weekStart = requested ?? weekStartOf(today);
  const dates = weekDates(weekStart);

  const [assignments, awaiting, templates] = await Promise.all([
    listAssignments(session, context.house.id, {
      from: dates[0],
      to: dates[6],
    }),
    listAwaitingConfirmation(session, context.house.id, context.me.id),
    listTemplates(session, context.house.id),
  ]);

  if (templates.filter((template) => template.active).length === 0) {
    return (
      <>
        <PageHeader title="Chores" />
        <EmptyState
          title="No chores are set up yet"
          body="A house needs its chore list before anything can be scheduled. The defaults cover most houses and take a minute to adjust."
          action={
            context.isAdmin ? (
              <Link href="/admin/chores" className={buttonVariants({ size: "sm" })}>
                Set up the chore list
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Chores"
        action={
          <div className="flex items-center gap-2">
            {awaiting.length > 0 ? (
              <Link href="/chores/mine">
                <Badge tone="warning">{awaiting.length} to confirm</Badge>
              </Link>
            ) : null}
            {context.isAdmin ? (
              <Link
                href="/admin/schedule"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Generate
              </Link>
            ) : null}
          </div>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          title="This week has not been generated"
          body="The schedule generates itself every Sunday evening. An admin can also run it now."
          action={
            context.isAdmin ? (
              <Link href="/admin/schedule" className={buttonVariants({ size: "sm" })}>
                Generate this week
              </Link>
            ) : undefined
          }
        />
      ) : (
        <WeekView
          chores={assignments}
          weekDates={dates}
          today={today}
          timezone={context.house.timezone}
          myMemberId={context.me.id}
          houseId={context.house.id}
          weekStart={weekStart}
          previousWeek={shiftWeek(weekStart, -1)}
          nextWeek={shiftWeek(weekStart, 1)}
        />
      )}
    </>
  );
}
