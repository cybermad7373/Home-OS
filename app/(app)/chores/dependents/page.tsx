import type { Metadata } from "next";
import { ChoreCard } from "@/components/chores/chore-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listAssignments, weekStartOf } from "@/lib/data/chores";
import { weekDates } from "@/lib/domain/scheduling/capacity";
import { formatDate, houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Their chores" };

/**
 * "Meera's jobs today", in one place.
 *
 * A dependent has no login, so their work has always been reachable only
 * through the house week view, mixed in with everybody else's. That works and
 * it is not what a parent wants at seven in the morning: they want the two
 * things the child owes today, with a button each.
 *
 * Marking done is the guardian's to do and confirming is not — the same split
 * migration 039 enforces in the database, for the reason that a guardian who
 * could confirm their own dependent's work would be scoring points unopposed.
 */
export default async function DependentChoresPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const dependents = context.members.filter(
    (member) =>
      member.kind === "dependent" &&
      member.guardianMemberId === context.me.id &&
      member.doesChores &&
      member.status === "active",
  );

  const today = houseToday(context.house.timezone);
  const dates = weekDates(weekStartOf(today));

  const byDependent = await Promise.all(
    dependents.map(async (dependent) => ({
      dependent,
      chores: await listAssignments(
        session,
        context.house.id,
        { from: dates[0], to: dates[6] },
        dependent.id,
      ),
    })),
  );

  return (
    <>
      <PageHeader
        title="Their chores"
        subtitle={
          dependents.length === 0
            ? "Nobody in your care has chores"
            : dependents.map((dependent) => dependent.displayName).join(", ")
        }
      />

      {dependents.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="This page lists the chores of anybody you are responsible for — a child, or anyone in the house without their own login."
        />
      ) : null}

      {byDependent.map(({ dependent, chores }) => {
        const todays = chores.filter((chore) => chore.choreDate === today);
        const rest = chores.filter((chore) => chore.choreDate !== today);
        const earned = chores
          .filter((chore) => chore.status === "confirmed")
          .reduce((sum, chore) => sum + chore.effortPoints, 0);
        const waiting = chores.filter((chore) => chore.status === "done_pending").length;

        return (
          <section key={dependent.id} className="mb-6">
            <h2 className="heading-text mb-1">{dependent.displayName}</h2>
            <p className="caption-text mb-2 text-text-muted">
              {earned} points confirmed this week
              {waiting > 0
                ? ` · ${waiting} waiting on somebody else to confirm`
                : ""}
            </p>

            {todays.length === 0 ? (
              <EmptyState
                title={`Nothing for ${dependent.displayName} today`}
                body={
                  rest.length > 0
                    ? `Next: ${formatDate(rest[0].choreDate, context.house.timezone)}, ${rest[0].name}.`
                    : "Nothing this week either."
                }
              />
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {todays.map((chore) => (
                    <li key={chore.id}>
                      <ChoreCard
                        chore={chore}
                        myMemberId={context.me.id}
                        houseId={context.house.id}
                        guardianFor={{
                          memberId: dependent.id,
                          displayName: dependent.displayName.split(" ")[0],
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {rest.length > 0 ? (
              <Card className="mt-2 p-0">
                <ul className="divide-y divide-border">
                  {rest.map((chore) => (
                    <li key={chore.id}>
                      <ChoreCard
                        chore={chore}
                        myMemberId={context.me.id}
                        houseId={context.house.id}
                        variant="compact"
                        guardianFor={{
                          memberId: dependent.id,
                          displayName: dependent.displayName.split(" ")[0],
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
