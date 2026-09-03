import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ChoreCard } from "@/components/chores/chore-card";
import { PageHeader } from "@/components/layout/page-header";
import { List, Section } from "@/components/layout/section";
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
        <Link
          href="/chores/dependents"
          className="mb-6 flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {dependents.map((dependent) => dependent.displayName.split(" ")[0]).join(" and ")}
              &apos;s chores
            </span>
            <span className="caption-text block text-text-muted">
              Mark them done on their behalf — somebody else confirms them.
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-text-subtle" aria-hidden />
        </Link>
      ) : null}

      {awaiting.length > 0 ? (
        <Section label={`Needs your confirmation · ${awaiting.length}`}>
          <p className="caption-text mb-3 text-text-muted">
            Somebody says they have done these. Until one of you confirms, they earn
            nothing — and after the house&apos;s auto-confirm window, silence counts as
            approval.
          </p>
          <List>
            {awaiting.map((chore) => (
              <li key={chore.id}>
                <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} />
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      <Section label={`Today · ${formatDate(today, context.house.timezone)}`}>
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
          <List>
            {todays.map((chore) => (
              <li key={chore.id}>
                <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} />
              </li>
            ))}
          </List>
        )}
      </Section>

      {rest.length > 0 ? (
        <Section label="Rest of the week">
          <List>
            {rest.map((chore) => (
              <li key={chore.id}>
                <ChoreCard
                  chore={chore}
                  myMemberId={context.me.id}
                  houseId={context.house.id}
                  variant="compact"
                />
              </li>
            ))}
          </List>
        </Section>
      ) : null}

      {pool.length > 0 ? (
        <Section label={`Up for grabs · ${pool.length}`}>
          <p className="caption-text mb-3 text-text-muted">
            Nobody is holding these. Claiming one is the fastest way to close a deficit.
          </p>
          <List>
            {pool.map((chore) => (
              <li key={chore.id}>
                <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} />
              </li>
            ))}
          </List>
        </Section>
      ) : null}
    </>
  );
}
