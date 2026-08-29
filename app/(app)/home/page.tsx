import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { MemberAvatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationBell } from "@/components/notifications/bell";
import { Leaderboard } from "@/components/chores/leaderboard";
import { getDailyCost } from "@/lib/data/analytics";
import { getUnreadCount } from "@/lib/data/notifications";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listExpenses, listPendingApprovals } from "@/lib/data/expenses";
import { countDecisionsAwaiting } from "@/lib/data/governance";
import { getPeriodPosition } from "@/lib/data/settlement";
import {
  getStanding,
  listAssignments,
  listAwaitingConfirmation,
  weekStartOf,
} from "@/lib/data/chores";
import { concentrationRatio, rankStanding } from "@/lib/domain/fairness/targets";
import { ownRowsFirst, owesRows, pendingItems } from "@/lib/domain/home/overview";
import { weekDates } from "@/lib/domain/scheduling/capacity";
import { formatMoney } from "@/lib/utils/money";
import { formatDate, houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Home" };

/**
 * S-51 — the Home overview. Replaces S-08 `/dashboard`, which now redirects
 * here.
 *
 * The difference from the dashboard it replaces is what the screen is *for*.
 * The dashboard answered "what must I do"; Today (S-50) answers that now. This
 * screen answers "where does the Home stand" — the week's effort, the month's
 * money, who owes whom for **everyone** rather than only the caller (DB-03),
 * what is pending, and a way into each module.
 */
export default async function HomeOverviewPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const today = houseToday(context.house.timezone);
  const period = today.slice(0, 7);
  const weekStart = weekStartOf(today);
  const dates = weekDates(weekStart);

  const [
    money,
    awaitingApproval,
    awaitingDecision,
    awaitingConfirm,
    myChores,
    standing,
    dailyCost,
    unread,
    position,
  ] = await Promise.all([
    listExpenses(session, context.house.id, context.me.id, { period }),
    listPendingApprovals(session, context.house.id, context.me.id),
    countDecisionsAwaiting(session, context.house.id, context.me.id),
    listAwaitingConfirmation(session, context.house.id, context.me.id),
    listAssignments(session, context.house.id, { from: dates[0], to: dates[6] }, context.me.id),
    getStanding(session, context.house.id, weekStart),
    getDailyCost(session, context.house, context.settings),
    getUnreadCount(session),
    // A pot household nets nothing, so the read that produces the transfer list
    // is skipped rather than computed and then hidden.
    context.shape.isPot
      ? Promise.resolve(null)
      : getPeriodPosition(session, context.house.id, period),
  ]);

  const joinRequests = context.members.filter((member) => member.status === "requested");
  const active = context.members.filter((member) => member.status === "active");

  const pending = pendingItems(
    {
      joinRequests: joinRequests.length,
      expenseApprovals: awaitingApproval.length,
      decisions: awaitingDecision,
      choreConfirmations: awaitingConfirm.length,
    },
    { isLead: context.isLead },
  );

  const earnedThisWeek = myChores
    .filter((chore) => chore.status === "confirmed")
    .reduce((sum, chore) => sum + chore.effortPoints, 0);
  const assignedThisWeek = myChores.reduce((sum, chore) => sum + chore.effortPoints, 0);

  const ranked = rankStanding(standing).map((row) => ({
    ...row,
    displayName: standing.find((s) => s.memberId === row.memberId)?.displayName ?? "Someone",
    avatarUrl: standing.find((s) => s.memberId === row.memberId)?.avatarUrl ?? null,
  }));

  const owes = position ? ownRowsFirst(owesRows(position.position), context.me.id) : [];

  // Positive means the house owes you. This mapping never inverts, anywhere.
  const yourNetPaise = money.yourPaidPaise - money.yourSharePaise;

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

      {/*
        One block for everything waiting, rather than a stack of one-line cards
        that push the Home's actual position off the screen. Today is where the
        caller works through them; this is where they learn there is work.
      */}
      {pending.length > 0 ? (
        <Card className="mb-3 border-warning p-0">
          <ul className="divide-y divide-border">
            {pending.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="touch-target flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="text-[15px]">{item.label}</span>
                  <Badge tone={item.urgent ? "warning" : "neutral"}>{item.count}</Badge>
                </Link>
              </li>
            ))}
          </ul>
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
                points confirmed · {Math.max(0, assignedThisWeek - earnedThisWeek)} still to go
              </CardDescription>
            </>
          )}
        </Card>

        {/*
          Two different questions, and which one matters depends on the
          household. Flatmates want to know where they stand with each other; a
          family has no such standing and wants to know what the month costs.
        */}
        {context.shape.isPot ? (
          <Link href="/money/daily" className="block">
            <Card className="h-full transition-colors hover:border-primary">
              <CardTitle>This month</CardTitle>
              <p className="display-number mt-2">
                {formatMoney(dailyCost.monthToDatePaise, { currency: context.house.currency })}
              </p>
              <CardDescription>
                {formatMoney(dailyCost.averagePerDayPaise, { currency: context.house.currency })} a
                day · on track for{" "}
                {formatMoney(dailyCost.projectedMonthPaise, { currency: context.house.currency })}
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
              {" · "}paid {formatMoney(money.yourPaidPaise, { currency: context.house.currency })}
            </CardDescription>
          </Card>
        )}
      </div>

      {/*
        DB-03 — the Home's full financial relationships, not only the caller's.
        Three rows and "see all", with any row the caller is part of lifted to
        the top: knowing that Bala owes Chitra is what stops two people settling
        the same debt twice.
      */}
      {owes.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-text">Who owes whom</h2>
            <Link className="caption-text text-primary" href="/settle">
              See all →
            </Link>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {owes.slice(0, 3).map((row) => (
                <li
                  key={`${row.fromMemberId}-${row.toMemberId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <p className="min-w-0 truncate text-[15px]">
                    <span className={row.fromMemberId === context.me.id ? "font-medium" : ""}>
                      {row.fromMemberId === context.me.id ? "You" : row.fromName}
                    </span>
                    <span className="text-text-muted">
                      {row.fromMemberId === context.me.id ? " owe " : " owes "}
                    </span>
                    <span className={row.toMemberId === context.me.id ? "font-medium" : ""}>
                      {row.toMemberId === context.me.id ? "you" : row.toName}
                    </span>
                  </p>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatMoney(row.amountPaise, { currency: context.house.currency })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          {owes.length > 3 ? (
            <p className="caption-text mt-2 text-text-muted">
              and {owes.length - 3} more {owes.length - 3 === 1 ? "payment" : "payments"}
            </p>
          ) : null}
        </section>
      ) : null}

      {context.shape.effortMode === "points" && ranked.some((row) => row.earnedPoints > 0) ? (
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
            {active.slice(0, 6).map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {member.displayName}
                    {member.id === context.me.id ? (
                      <span className="caption-text text-text-subtle"> · you</span>
                    ) : null}
                  </p>
                  <p className="caption-text text-text-muted">{member.room?.name ?? "No room"}</p>
                </div>
                {member.role === "admin" ? <Badge tone="primary">Admin</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/*
        The way into every module, so no screen in the product is reachable
        only from a URL — the phase's own acceptance criterion.
      */}
      <section className="mt-6">
        <h2 className="heading-text mb-3">Go to</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { href: "/today", label: "Today" },
            { href: "/chores", label: "Chores" },
            { href: "/money", label: "Money" },
            { href: "/food", label: "Food" },
            { href: "/more/calendar", label: "Calendar" },
            { href: "/more", label: "More" },
          ].map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="touch-target flex items-center justify-center rounded-[10px] border border-border bg-surface px-3 py-3 text-[15px] hover:border-primary"
              >
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
