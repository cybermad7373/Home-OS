import type { Metadata } from "next";
import Link from "next/link";
import { ChoreCard } from "@/components/chores/chore-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getHouseContext, requireSession } from "@/lib/data/house";
import {
  listAssignments,
  listAwaitingConfirmation,
  listOpenPool,
  weekStartOf,
} from "@/lib/data/chores";
import { weekDates } from "@/lib/domain/scheduling/capacity";
import { formatDate, houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "My chores" };

/**
 * S-10 — my chores, plus the two queues that need the caller specifically:
 * what is waiting on them to confirm, and what nobody is holding.
 *
 * Confirmations come first. A stalled confirmation queue is the failure mode
 * that breaks the whole points mechanism, so it goes above the fold.
 */
export default async function MyChoresPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const today = houseToday(context.house.timezone);
  const dates = weekDates(weekStartOf(today));

  const [mine, awaiting, pool] = await Promise.all([
    listAssignments(
      session,
      context.house.id,
      { from: dates[0], to: dates[6] },
      context.me.id,
    ),
    listAwaitingConfirmation(session, context.house.id, context.me.id),
    listOpenPool(session, context.house.id),
  ]);

  // Anybody in the caller's care who is given work of their own. Their chores
  // have a page rather than a section here, because a parent opening this one
  // is looking for their own list first.
  const dependents = context.members.filter(
    (member) =>
      member.kind === "dependent" &&
      member.guardianMemberId === context.me.id &&
      member.doesChores &&
      member.status === "active",
  );

  const todays = mine.filter((chore) => chore.choreDate === today);
  const rest = mine.filter((chore) => chore.choreDate !== today);
  const earned = mine
    .filter((chore) => chore.status === "confirmed")
    .reduce((sum, chore) => sum + chore.effortPoints, 0);

  return (
    <>
      <PageHeader
        title="My chores"
        subtitle={`${earned} points confirmed this week`}
      />

      {dependents.length > 0 ? (
        <Link href="/chores/dependents" className="mb-4 block">
          <Card className="transition-colors hover:border-primary">
            <p className="font-medium">
              {dependents.map((dependent) => dependent.displayName.split(" ")[0]).join(" and ")}
              {dependents.length === 1 ? "'s chores" : "'s chores"}
            </p>
            <p className="caption-text text-text-muted">
              Mark them done on their behalf — somebody else confirms them.
            </p>
          </Card>
        </Link>
      ) : null}

      {awaiting.length > 0 ? (
        <section className="mb-6">
          <h2 className="heading-text mb-2">Needs your confirmation</h2>
          <p className="caption-text mb-2 text-text-muted">
            Somebody says they have done these. Until one of you confirms, they earn
            nothing — and after the house&apos;s auto-confirm window, silence counts as
            approval.
          </p>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {awaiting.map((chore) => (
                <li key={chore.id}>
                  <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="heading-text mb-2">
          Today · {formatDate(today, context.house.timezone)}
        </h2>
        {todays.length === 0 ? (
          <EmptyState
            title="Nothing assigned today"
            body={
              rest.length > 0
                ? `Next: ${formatDate(rest[0].choreDate, context.house.timezone)}, ${rest[0].name}.`
                : "Nothing this week either. The schedule generates on Sunday evening."
            }
          />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {todays.map((chore) => (
                <li key={chore.id}>
                  <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {rest.length > 0 ? (
        <section className="mb-6">
          <h2 className="heading-text mb-2">Rest of the week</h2>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {rest.map((chore) => (
                <li key={chore.id}>
                  <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} variant="compact" />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {pool.length > 0 ? (
        <section>
          <h2 className="heading-text mb-2">Up for grabs</h2>
          <p className="caption-text mb-2 text-text-muted">
            Nobody is holding these. Claiming one is the fastest way to close a deficit.
          </p>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {pool.map((chore) => (
                <li key={chore.id}>
                  <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );
}
