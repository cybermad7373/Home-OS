import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationBell } from "@/components/notifications/bell";
import { ChoreCard } from "@/components/chores/chore-card";
import { AnnouncementsBlock } from "@/components/announcements/announcements-block";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getUnreadCount } from "@/lib/data/notifications";
import { getToday } from "@/lib/data/today";
import { presenceLabel } from "@/lib/domain/home/today";
import { formatMoney } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Today" };

/**
 * S-50 — Today. The screen the product is used from.
 *
 * Six blocks, always in this order: People, My chores, Needs you, Money, Food,
 * Announcements, and the calendar link under them. A block with nothing in it
 * is **omitted**, not shown empty — except Food, whose prompt is the point.
 *
 * All of it comes from one composed read (`getToday`), which is also what
 * `GET /api/today` returns, so the page and the endpoint cannot disagree.
 */
export default async function TodayPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const [today, unread] = await Promise.all([
    getToday(session, context),
    getUnreadCount(session),
  ]);

  const currency = context.house.currency;
  const openChores = today.myChores.filter((chore) => chore.status !== "confirmed");

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={formatDate(today.date, context.house.timezone, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}
        action={<NotificationBell unread={unread} />}
      />

      {/* People — who is here, and who is not. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading-text">People</h2>
          <span className="caption-text text-text-muted">{presenceLabel(today.presence)}</span>
        </div>
        <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
          {today.presence.home.map((member) => (
            <span key={member.memberId} className="caption-text text-text">
              <span aria-hidden className="text-success">
                ●
              </span>{" "}
              {member.displayName}
            </span>
          ))}
          {today.presence.away.map((member) => (
            <span key={member.memberId} className="caption-text text-text-muted">
              <span aria-hidden>○</span> {member.displayName}
              <span className="sr-only"> is away</span>
            </span>
          ))}
        </Card>
      </section>

      {/*
        My chores. CE-12: Done is one tap from here — the ChoreCard's own
        control marks it, and the photo and the note open after the transition,
        never before it.
      */}
      {openChores.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-text">My chores</h2>
            <Link className="caption-text text-primary" href="/chores/mine">
              All mine →
            </Link>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {openChores.map((chore) => (
                <li key={chore.id}>
                  <ChoreCard
                    chore={chore}
                    myMemberId={context.me.id}
                    houseId={context.house.id}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/*
        Needs you — chore confirmations, expense approvals and decisions in one
        list, ordered by urgency rather than by kind. A Critical decision
        carries the mark and sits above everything.
      */}
      {today.needsYou.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-text">Needs you</h2>
            <Badge tone="warning">{today.needsYou.length}</Badge>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {today.needsYou.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={item.href}
                    className="touch-target flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px]">
                        {item.critical ? (
                          <span aria-label="Critical" className="text-danger">
                            ⚠{" "}
                          </span>
                        ) : null}
                        {item.title}
                      </span>
                      <span className="caption-text block text-text-muted">{item.detail}</span>
                    </span>
                    <span aria-hidden className="caption-text shrink-0 text-primary">
                      Review →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/* Money — what today cost, and what is still unapproved in it. */}
      {today.money.expenses.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-text">Money</h2>
            <Link className="caption-text text-primary" href="/expenses">
              All →
            </Link>
          </div>
          <Card>
            <p className="display-number">
              {formatMoney(today.money.totalPaise, { currency })}
            </p>
            <CardDescription>
              {today.money.expenses
                .slice(0, 2)
                .map((expense) =>
                  [
                    expense.description ?? expense.category.name,
                    expense.paidBy.displayName,
                    expense.status === "pending_approval" ? "pending approval" : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                )
                .join(" — ")}
            </CardDescription>
          </Card>
        </section>
      ) : null}

      {/*
        Food. The one block that is shown even when it holds nothing, because
        the prompt is the point: an unrecorded meal is the commonest gap in the
        Home's record, and asking is what closes it.
      */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="heading-text">Food</h2>
          <Link className="caption-text text-primary" href="/food">
            Add a meal →
          </Link>
        </div>
        <Card>
          {today.food.meals.length > 0 ? (
            <p className="text-[15px]">
              {today.food.meals.map((meal) => meal.name).join(" · ")}
            </p>
          ) : (
            <p className="text-[15px]">What did you eat?</p>
          )}

          {today.food.plans.length > 0 ? (
            <CardDescription className="mt-1">
              Planned: {today.food.plans.map((plan) => plan.name).join(" · ")}
            </CardDescription>
          ) : null}

          {/*
            The Home's own library, never an invention. The AI half lives on
            the Food screen, where waiting for a model is acceptable.
          */}
          {today.food.suggestions.length > 0 ? (
            <CardDescription className="mt-1">
              Try: {today.food.suggestions.map((food) => food.name).join(" · ")}
            </CardDescription>
          ) : today.food.coldStart ? (
            <CardDescription className="mt-1">
              Record a few meals and this starts suggesting from what the home actually eats.
            </CardDescription>
          ) : null}
        </Card>
      </section>

      <AnnouncementsBlock
        announcements={today.announcements}
        canPost={context.isLead}
        timezone={context.house.timezone}
      />

      <div className="mt-6">
        <Link
          href="/more/calendar"
          className="touch-target flex items-center justify-center rounded-[10px] border border-border bg-surface px-3 py-3 text-[15px] hover:border-primary"
        >
          View calendar →
        </Link>
      </div>
    </>
  );
}
