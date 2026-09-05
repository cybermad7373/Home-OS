import type { Metadata } from "next";
import Link from "next/link";
import { WeekView } from "@/components/chores/week-view";
import { PageHeader } from "@/components/layout/page-header";
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
import { weeklyLoadSummary } from "@/lib/domain/scheduling/demand";
import { houseToday } from "@/lib/utils/date";
import { looksLikeIsoDate } from "@/lib/validation/common";

export const metadata: Metadata = {
  title: "Chores",
  description: "The house week: every chore, who holds it, and what nobody is holding.",
};

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
  /*
    `?week_start=` is how the previous and next week links work, so it is also
    the easiest thing in the app to mangle by hand. Anything that is not a real
    date falls back to this week rather than reaching `weekDates`, which built a
    range of `NaN` and took the whole screen down with a 500.
  */
  const weekStart = looksLikeIsoDate(requested) ? requested : weekStartOf(today);
  const dates = weekDates(weekStart);

  const [assignments, awaiting, templates] = await Promise.all([
    listAssignments(session, context.house.id, {
      from: dates[0],
      to: dates[6],
    }),
    listAwaitingConfirmation(session, context.house.id, context.me.id),
    listTemplates(session, context.house.id),
  ]);

  // The same figure the chore-list screen shows, so the empty state can say
  // what pressing Generate will actually do.
  const activeTemplates = templates.filter((template) => template.active);
  const load = weeklyLoadSummary(
    activeTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      effortPoints: template.effort_points,
      durationMin: template.duration_min,
      slot: template.slot,
      scope: template.scope,
      roomId: template.room_id,
      frequency: template.frequency,
      timesPerWeek: template.times_per_week,
      requiresCookingSkill: template.requires_cooking_skill,
      isHeavy: template.is_heavy,
    })),
    weekStart,
    context.members.filter((member) => member.status === "active").length,
    context.rooms.map((room) => room.id),
  );

  if (activeTemplates.length === 0) {
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
        subtitle={
          awaiting.length > 0
            ? `${awaiting.length} ${awaiting.length === 1 ? "chore is" : "chores are"} waiting on your confirmation`
            : undefined
        }
        action={
          context.isAdmin ? (
            <Link
              href="/admin/schedule"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Generate
            </Link>
          ) : undefined
        }
      />

      {assignments.length === 0 ? (
        /*
          What Generate is about to do, before it does it.
          This state used to say only that the week had not been generated and
          offer the button. A new Home arrives with a full chore list already in
          it — 43 jobs in the default set — and nothing here mentioned that, so
          the first thing an owner did in this product was press a button whose
          consequences were invisible, on a list they did not know existed and
          had never been shown how to change.
        */
        <EmptyState
          title="This week has not been generated"
          body={
            load.instanceCount > 0
              ? `Generating it will share out ${load.instanceCount} chores worth ${load.totalPoints} points, from the list this home already has — about ${load.targetPerMember} points each. It also happens on its own every Sunday evening.`
              : "The schedule generates itself every Sunday evening. An admin can also run it now."
          }
          action={
            context.isAdmin ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link href="/admin/schedule" className={buttonVariants({ size: "sm" })}>
                  Generate this week
                </Link>
                <Link
                  href="/admin/chores"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  See what is on the list
                </Link>
              </div>
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
