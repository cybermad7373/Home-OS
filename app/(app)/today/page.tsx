import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/app/(app)/home/Section";
import { Readout } from "@/components/ui/readout";
import { ChoreCard } from "@/components/chores/chore-card";
import { AnnouncementsBlock } from "@/components/announcements/announcements-block";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getToday } from "@/lib/data/today";
import { presenceLabel } from "@/lib/domain/home/today";
import { formatMoney } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Today" };

/**
 * S-50 — Today. The screen the product is used from.
 *
 * The order is fixed and it is an order of obligation: who is here, what you
 * owe, what is blocked on you, what today cost, what there is to eat, what the
 * house said. A block with nothing in it is **omitted**, not shown empty —
 * except Food, whose prompt is the point.
 *
 * All of it comes from one composed read (`getToday`), which is also what
 * `GET /api/today` returns, so the page and the endpoint cannot disagree.
 *
 * Every block used to carry its own 16px heading inside its own card, so the
 * screen read as six objects of equal weight and none of them was the answer
 * to "what do I have to do today". The headings are hairline rules now, and
 * the content is the only thing with weight.
 */
export default async function TodayPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const today = await getToday(session, context);

  const currency = context.house.currency;
  const openChores = today.myChores.filter((chore) => chore.status !== "confirmed");

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={formatDate(today.date, context.house.timezone, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />

      {/* Who is here, and who is not. One line, because on most days it is one
          fact and it does not deserve a card. */}
      <Section
        label={`People · ${presenceLabel(today.presence)}`}
        href="/house/away"
        linkLabel="Away"
      >
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {today.presence.home.map((member) => (
            <li key={member.memberId} className="flex items-center gap-1.5 text-[14px]">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-text" />
              {member.displayName}
            </li>
          ))}
          {today.presence.away.map((member) => (
            <li
              key={member.memberId}
              className="flex items-center gap-1.5 text-[14px] text-text-subtle"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-border-strong" />
              {member.displayName}
              <span className="sr-only"> is away</span>
            </li>
          ))}
        </ul>
      </Section>

      {/*
        My chores. CE-12: Done is one tap from here — the ChoreCard's own
        control marks it, and the photo and the note open after the transition,
        never before it.
      */}
      {openChores.length > 0 ? (
        <Section label="My chores" href="/chores/mine" linkLabel="All mine">
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            {openChores.map((chore) => (
              <li key={chore.id}>
                <ChoreCard chore={chore} myMemberId={context.me.id} houseId={context.house.id} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/*
        Needs you — chore confirmations, expense approvals and decisions in one
        list, ordered by urgency rather than by kind. A Critical decision
        carries the accent rule and sits above everything.
      */}
      {today.needsYou.length > 0 ? (
        <Section label={`Needs you · ${today.needsYou.length}`}>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            {today.needsYou.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className={cn(
                    "touch-target relative flex items-center gap-3 py-3 pl-4 pr-3 transition-colors hover:bg-surface-2",
                    item.critical &&
                      "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15px]">
                      {item.critical ? (
                        <TriangleAlert
                          size={13}
                          className="shrink-0 text-accent"
                          aria-label="Critical"
                        />
                      ) : null}
                      <span className="truncate">{item.title}</span>
                    </span>
                    <span className="caption-text block truncate text-text-muted">
                      {item.detail}
                    </span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* What today cost, and what is still unapproved in it. The 2.0 version
          printed one run-on sentence joining two expenses with an em dash; a
          list of amounts is both shorter and the thing being asked about. */}
      {today.money.expenses.length > 0 ? (
        <Section label="Money · today" href="/expenses" linkLabel="Ledger">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <Readout value={formatMoney(today.money.totalPaise, { currency })} size="lg" />
            <ul className="mt-3 space-y-1">
              {today.money.expenses.slice(0, 3).map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-baseline justify-between gap-3 text-[14px]"
                >
                  <span className="min-w-0 truncate">
                    {expense.description ?? expense.category.name}
                    <span className="text-text-muted"> · {expense.paidBy.displayName}</span>
                    {expense.status === "pending_approval" ? (
                      <span className="text-text-subtle"> · unapproved</span>
                    ) : null}
                  </span>
                  <span className="tabular shrink-0 text-text-muted">
                    {formatMoney(expense.amountPaise, { currency })}
                  </span>
                </li>
              ))}
            </ul>
            {today.money.expenses.length > 3 ? (
              <p className="caption-text mt-2 text-text-subtle">
                and {today.money.expenses.length - 3} more
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/*
        Food. The one block that is shown even when it holds nothing, because
        the prompt is the point: an unrecorded meal is the commonest gap in the
        Home's record, and asking is what closes it.
      */}
      <Section label="Food" href="/food" linkLabel="Add a meal">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          {today.food.meals.length > 0 ? (
            <p className="text-[15px]">{today.food.meals.map((meal) => meal.name).join(" · ")}</p>
          ) : (
            <p className="text-[15px]">What did you eat?</p>
          )}

          {today.food.plans.length > 0 ? (
            <p className="caption-text mt-2 text-text-muted">
              <span className="eyebrow-text mr-2">Planned</span>
              {today.food.plans.map((plan) => plan.name).join(" · ")}
            </p>
          ) : null}

          {/*
            The Home's own library, never an invention. The AI half lives on
            the Food screen, where waiting for a model is acceptable.
          */}
          {today.food.suggestions.length > 0 ? (
            <p className="caption-text mt-1.5 text-text-muted">
              <span className="eyebrow-text mr-2">Often</span>
              {today.food.suggestions.map((food) => food.name).join(" · ")}
            </p>
          ) : today.food.coldStart ? (
            <p className="caption-text mt-2 text-text-subtle">
              Record a few meals and this starts suggesting from what the home actually eats.
            </p>
          ) : null}
        </div>
      </Section>

      <AnnouncementsBlock
        announcements={today.announcements}
        canPost={context.isLead}
        timezone={context.house.timezone}
      />

      <div className="mt-8">
        <Link
          href="/more/calendar"
          className="touch-target flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[15px] transition-colors hover:border-border-strong hover:bg-surface-2"
        >
          <span>
            The week ahead
            <span className="caption-text block text-text-muted">
              Chores, money, food and decisions on one timeline
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-text-subtle" aria-hidden />
        </Link>
      </div>
    </>
  );
}
