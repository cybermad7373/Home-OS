import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SetupNudges, type Nudge } from "@/components/layout/setup-nudges";
import { getDailyCost } from "@/lib/data/analytics";
import { hasAvailability } from "@/lib/data/availability";
import { getLlmConfig } from "@/lib/data/llm";
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
import { rankStanding } from "@/lib/domain/fairness/targets";
import { ownRowsFirst, owesRows, pendingItems } from "@/lib/domain/home/overview";
import { weekDates } from "@/lib/domain/scheduling/capacity";
import { formatDate, houseToday } from "@/lib/utils/date";
import { Section } from "@/components/layout/section";
import { HomeFigures } from "./HomeFigures";
import { HomeOwesWhom } from "./HomeOwesWhom";
import { HomeStanding } from "./HomeStanding";
import { HomePendingBlock } from "./HomePendingBlock";
import { HomeHouseMembers } from "./HomeHouseMembers";

export const metadata: Metadata = { title: "Home" };

/**
 * S-51 — the Home overview. Replaces S-08 `/dashboard`, which now redirects
 * here.
 *
 * The difference from the dashboard it replaces is what the screen is *for*.
 * The dashboard answered "what must I do"; Today (S-50) answers that now. This
 * screen answers "where does the Home stand" — the week's effort, the month's
 * money, who owes whom for **everyone** rather than only the caller (DB-03),
 * and what is pending.
 *
 * It no longer ends in a grid of module tiles. Those six tiles — Today,
 * Chores, Money, Food, Calendar, More — were the bottom bar drawn a second
 * time, in a second visual language, half a screen further down. Every route
 * they offered is one tap away from the bar that is always on screen, so the
 * tiles cost a scroll and taught nobody anything.
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
    position,
  ] = await Promise.all([
    listExpenses(session, context.house.id, context.me.id, { period }),
    listPendingApprovals(session, context.house.id, context.me.id),
    countDecisionsAwaiting(session, context.house.id, context.me.id),
    listAwaitingConfirmation(session, context.house.id, context.me.id),
    listAssignments(session, context.house.id, { from: dates[0], to: dates[6] }, context.me.id),
    getStanding(session, context.house.id, weekStart),
    getDailyCost(session, context.house, context.settings),
    // A pot household nets nothing, so the read that produces the transfer list
    // is skipped rather than computed and then hidden.
    context.shape.isPot
      ? Promise.resolve(null)
      : getPeriodPosition(session, context.house.id, period),
  ]);

  // Onboarding no longer forces availability, notifications or the AI key —
  // asking somebody their usual hours before they have seen a single chore is
  // asking them to guess. These are what is left, surfaced where it can be
  // acted on and dismissed for good.
  const [availabilitySet, llm] = await Promise.all([
    hasAvailability(session, context.house.id, context.me.id),
    context.isAdmin
      ? getLlmConfig(session, context.house.id)
      : Promise.resolve({ configured: true as const }),
  ]);

  const nudges: Nudge[] = [
    !availabilitySet && {
      id: "availability",
      href: "/house/availability",
      title: "Tell the house when you are around",
      body: "The scheduler will stop giving you Tuesday's cooking when you are never home on a Tuesday.",
    },
    !llm.configured && {
      id: "ai",
      href: "/admin/settings/ai",
      title: "Add an AI key for this home",
      body: "Optional and free on most providers. Without one, every AI feature quietly uses its ordinary path.",
    },
  ].filter(Boolean) as Nudge[];

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
      {/* The house's name is in the switcher at the top of every screen, so
          printing it again 40px lower says nothing. The date is what this
          screen is actually about. */}
      <PageHeader
        title={formatDate(today, context.house.timezone, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        subtitle={`${active.length} ${active.length === 1 ? "member" : "members"} at ${context.house.name}`}
      />

      <SetupNudges nudges={nudges} />

      {/* Anything the house is blocked on you for comes before anything it
          merely wants you to know. */}
      <HomePendingBlock pending={pending} />

      <HomeFigures
        earnedThisWeek={earnedThisWeek}
        assignedThisWeek={assignedThisWeek}
        isPot={context.shape.isPot}
        dailyCost={dailyCost}
        yourNetPaise={yourNetPaise}
        money={money}
        currency={context.house.currency}
      />

      {owes.length > 0 ? (
        <Section label="Who owes whom" href="/settle" linkLabel="Settle up">
          <HomeOwesWhom owes={owes} meId={context.me.id} currency={context.house.currency} />
        </Section>
      ) : null}

      {context.shape.effortMode === "points" && ranked.some((row) => row.earnedPoints > 0) ? (
        <Section label="Standing" href="/chores/standing">
          <HomeStanding ranked={ranked} meId={context.me.id} />
        </Section>
      ) : null}

      <Section label="The house" href="/house/members">
        <HomeHouseMembers active={active} meId={context.me.id} />
      </Section>
    </>
  );
}
