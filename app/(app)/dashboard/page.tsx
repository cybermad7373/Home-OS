import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { MemberAvatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationBell } from "@/components/notifications/bell";
import { getDailyCost } from "@/lib/data/analytics";
import { getUnreadCount } from "@/lib/data/notifications";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listExpenses, listPendingApprovals } from "@/lib/data/expenses";
import {
  getStanding,
  listAssignments,
  listAwaitingConfirmation,
  weekStartOf,
} from "@/lib/data/chores";
import { ChoreCard } from "@/components/chores/chore-card";
import { Leaderboard } from "@/components/chores/leaderboard";
import { concentrationRatio, rankStanding } from "@/lib/domain/fairness/targets";
import { weekDates } from "@/lib/domain/scheduling/capacity";
import { formatMoney } from "@/lib/utils/money";
import { formatDate, houseToday } from "@/lib/utils/date";
import { RESIDENCY_LABEL } from "@/lib/types/domain";

export const metadata: Metadata = { title: "Home" };

/**
 * S-08 — the dashboard.
 *
 * The screen that must answer everything at a glance: what do I owe the house
 * in work, what do I owe in money, and what must I do today.
 *
 * Confirmation requests sit above the fold whenever any exist, because a
 * stalled confirmation queue is the failure mode that breaks the product.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const today = houseToday(context.house.timezone);
  const period = today.slice(0, 7);

  const weekStart = weekStartOf(today);
  const dates = weekDates(weekStart);

  const [money, awaitingMe, myChores, awaitingConfirm, standing, dailyCost, unread] =
    await Promise.all([
    listExpenses(session, context.house.id, context.me.id, { period }),
    listPendingApprovals(session, context.house.id, context.me.id),
    listAssignments(
      session,
      context.house.id,
      { from: dates[0], to: dates[6] },
      context.me.id,
    ),
    listAwaitingConfirmation(session, context.house.id, context.me.id),
    getStanding(session, context.house.id, weekStart),
    getDailyCost(session, context.house, context.settings),
    getUnreadCount(session),
  ]);

  const earnedThisWeek = myChores
    .filter((chore) => chore.status === "confirmed")
    .reduce((sum, chore) => sum + chore.effortPoints, 0);
  const assignedThisWeek = myChores.reduce((sum, chore) => sum + chore.effortPoints, 0);
  const todaysChores = myChores.filter(
    (chore) => chore.choreDate === today && chore.status !== "confirmed",
  );

  const ranked = rankStanding(standing).map((row) => ({
    ...row,
    displayName: standing.find((s) => s.memberId === row.memberId)?.displayName ?? "Someone",
    avatarUrl: standing.find((s) => s.memberId === row.memberId)?.avatarUrl ?? null,
  }));

  // Positive means the house owes you. This mapping never inverts, anywhere.
  const yourNetPaise = money.yourPaidPaise - money.yourSharePaise;

  const pending = context.members.filter((member) => member.status === "requested");
  const active = context.members.filter((member) => member.status === "active");
  const withoutRoom = active.filter((member) => !member.room);

  return (
    <>
      <PageHeader
        title={context.house.name}
        subtitle={`${formatDate(today, context.house.timezone, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })} · ${active.length} ${active.length === 1 ? "member" : "members"}`}
        action={<NotificationBell unread={unread} />}
      />

      {context.isAdmin && pending.length > 0 ? (
        <Card className="mb-3 border-warning">
          <CardTitle>
            {pending.length} {pending.length === 1 ? "person is" : "people are"} waiting to
            join
          </CardTitle>
          <CardDescription>
            They see nothing of the house until you approve them.
          </CardDescription>
          <Link
            href="/house/members"
            className={buttonVariants({ size: "sm", className: "mt-3" })}
          >
            Review requests
          </Link>
        </Card>
      ) : null}

      {awaitingMe.length > 0 ? (
        <Card className="mb-3 border-warning">
          <CardTitle>
            {awaitingMe.length} {awaitingMe.length === 1 ? "expense needs" : "expenses need"}{" "}
            your approval
          </CardTitle>
          <CardDescription>
            Nothing above the threshold counts towards anybody until somebody other than
            the payer signs it off.
          </CardDescription>
          <Link
            href="/expenses/approvals"
            className={buttonVariants({ size: "sm", className: "mt-3" })}
          >
            Review them
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardTitle>This week</CardTitle>
          {assignedThisWeek === 0 ? (
            <>
              <p className="display-number mt-2 text-text-subtle">—</p>
              <CardDescription>Nothing assigned to you this week yet.</CardDescription>
            </>
          ) : (
            <>
              <p className="display-number mt-2">
                {earnedThisWeek}
                <span className="text-text-subtle"> / {assignedThisWeek}</span>
              </p>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuenow={earnedThisWeek}
                aria-valuemin={0}
                aria-valuemax={assignedThisWeek}
              >
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.min(100, (earnedThisWeek / assignedThisWeek) * 100)}%`,
                  }}
                />
              </div>
              <CardDescription className="mt-2">
                points confirmed ·{" "}
                {Math.max(0, assignedThisWeek - earnedThisWeek)} still to go
              </CardDescription>
            </>
          )}
        </Card>

        {/*
          Two different questions, and which one matters depends on the
          household. Flatmates want to know where they stand with each other.
          A family has no such standing, and wants to know what the month is
          costing — the same tile would otherwise always read zero.
        */}
        {context.shape.isPot ? (
          <Link href="/money/daily" className="block">
            <Card className="h-full transition-colors hover:border-primary">
              <CardTitle>This month</CardTitle>
              <p className="display-number mt-2">
                {formatMoney(dailyCost.monthToDatePaise, {
                  currency: context.house.currency,
                })}
              </p>
              <CardDescription>
                {formatMoney(dailyCost.averagePerDayPaise, {
                  currency: context.house.currency,
                })}{" "}
                a day · on track for{" "}
                {formatMoney(dailyCost.projectedMonthPaise, {
                  currency: context.house.currency,
                })}
              </CardDescription>
            </Card>
          </Link>
        ) : (
          <Card>
            <CardTitle>This month</CardTitle>
            <p
              className={
                yourNetPaise === 0
                  ? "display-number mt-2"
                  : yourNetPaise > 0
                    ? "display-number mt-2 text-success"
                    : "display-number mt-2 text-danger"
              }
            >
              {formatMoney(Math.abs(yourNetPaise), { currency: context.house.currency })}
            </p>
            <CardDescription>
              {yourNetPaise === 0
                ? "You are square with the house"
                : yourNetPaise > 0
                  ? "the house owes you"
                  : "you owe the house"}
              {" · "}
              paid{" "}
              {formatMoney(money.yourPaidPaise, { currency: context.house.currency })}
            </CardDescription>
          </Card>
        )}
      </div>

      {/*
        The running cost, wherever the house is splitting. A pot household
        already has it in the tile above.
      */}
      {!context.shape.isPot && dailyCost.monthToDatePaise > 0 ? (
        <Link href="/money/daily" className="mt-3 block">
          <Card className="flex items-center justify-between gap-3 transition-colors hover:border-primary">
            <div>
              <CardDescription>The house is spending</CardDescription>
              <p className="font-medium tabular-nums">
                {formatMoney(dailyCost.averagePerDayPaise, {
                  currency: context.house.currency,
                })}{" "}
                a day
              </p>
            </div>
            <span className="caption-text text-primary">Where it goes →</span>
          </Card>
        </Link>
      ) : null}

      {todaysChores.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-text">Today</h2>
            <Link className="caption-text text-primary" href="/chores/mine">
              All mine →
            </Link>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {todaysChores.map((chore) => (
                <li key={chore.id}>
                  <ChoreCard chore={chore} myMemberId={context.me.id} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/* Above everything else it can be: a queue nobody clears is a queue that
          quietly stops other people earning what they worked for. */}
      {awaitingConfirm.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-text">Needs your confirmation</h2>
            <Badge tone="warning">{awaitingConfirm.length}</Badge>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {awaitingConfirm.slice(0, 3).map((chore) => (
                <li key={chore.id}>
                  <ChoreCard chore={chore} myMemberId={context.me.id} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {context.shape.effortMode === "points" &&
      ranked.some((row) => row.earnedPoints > 0) ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-text">House standing</h2>
            <Link className="caption-text text-primary" href="/chores/standing">
              See all →
            </Link>
          </div>
          <Leaderboard
            standing={ranked}
            concentrationRatio={concentrationRatio(ranked)}
            myMemberId={context.me.id}
            limit={3}
          />
        </section>
      ) : null}

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="heading-text">The house</h2>
          <Link className="caption-text text-primary" href="/house/members">
            See all →
          </Link>
        </div>

        <Card className="p-0">
          <ul className="divide-y divide-border">
            {active.slice(0, 8).map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {member.displayName}
                    {member.id === context.me.id ? (
                      <span className="caption-text text-text-subtle"> · you</span>
                    ) : null}
                  </p>
                  <p className="caption-text text-text-muted">
                    {member.room?.name ?? "No room"} · {RESIDENCY_LABEL[member.residency]}
                  </p>
                </div>
                {member.role === "admin" ? <Badge tone="primary">Admin</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {context.isAdmin ? (
        <section className="mt-6">
          <h2 className="heading-text mb-3">Set the house up</h2>
          <Card>
            <ul className="flex flex-col gap-3">
              <SetupStep
                done={context.rooms.length > 0}
                label="Add the rooms and their rent"
                href="/house/rooms"
              />
              <SetupStep
                done={withoutRoom.length === 0 && context.rooms.length > 0}
                label="Put every member in a room"
                href="/house/rooms"
              />
              <SetupStep
                done={active.length > 1}
                label="Send the others your invite link"
                href="/admin/settings"
              />
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );
}

function SetupStep({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className={
          done
            ? "flex h-6 w-6 items-center justify-center rounded-full bg-success-bg text-[13px] text-success"
            : "flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-[13px] text-text-subtle"
        }
      >
        {done ? "✓" : ""}
      </span>
      <Link href={href} className={done ? "text-text-muted line-through" : "text-text"}>
        {label}
      </Link>
      <span className="sr-only">{done ? "done" : "not done"}</span>
    </li>
  );
}
