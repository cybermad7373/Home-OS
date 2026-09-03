import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { MemberAvatar } from "@/components/ui/avatar";
import { WAITING, visibleGroups } from "@/components/layout/destinations";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { countDecisionsAwaiting } from "@/lib/data/governance";
import { getUnreadCount } from "@/lib/data/notifications";
import { HOME_TYPE_LABEL, RESIDENCY_LABEL } from "@/lib/types/domain";

export const metadata: Metadata = { title: "More" };

/**
 * Everything that is not one of the five things on the bar.
 *
 * The 2.0 version was a single ungrouped column of twenty-two link cards, each
 * with a sentence under it — a wall that took the same effort to scan whether
 * you were looking for "away days" or "rooms". It was the clearest symptom of
 * the navigation problem: a dumping ground is what a menu becomes when nothing
 * decides what belongs in it.
 *
 * Now it renders the same groups the sidebar and the command palette do, from
 * `destinations.ts`. The grouping is by the question a person is asking — "when
 * am I around" and "who is staying" are the same question, so availability and
 * guests sit together even though they belong to different modules.
 */
export default async function MorePage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const [pendingApprovals, unread] = await Promise.all([
    countDecisionsAwaiting(session, context.house.id, context.me.id),
    getUnreadCount(session),
  ]);

  const groups = visibleGroups({
    isPot: context.shape.isPot,
    isRota: context.shape.effortMode === "rota",
    isAdmin: context.isAdmin,
    isLead: context.isLead,
    isFamily: context.shape.homeType === "family",
    gameLayer: context.settings.game_layer_enabled ?? false,
    hasDependents: context.members.some((member) => member.kind === "dependent"),
  });

  const counts: Record<string, number> = {
    "/more/approvals": pendingApprovals,
    "/notifications": unread,
  };

  return (
    <>
      <PageHeader title="More" />

      <Link href="/onboarding/profile" className="block">
        <div className="card-shell card-interactive mb-6 flex items-center gap-3 p-3">
          <MemberAvatar
            name={context.me.displayName}
            avatarUrl={context.me.avatarUrl}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{context.me.displayName}</p>
            <p className="caption-text truncate text-text-muted">
              {context.me.username ? `@${context.me.username} · ` : ""}
              {context.house.name} · {HOME_TYPE_LABEL[context.shape.homeType]} ·{" "}
              {RESIDENCY_LABEL[context.me.residency]}
            </p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-text-subtle" aria-hidden />
        </div>
      </Link>

      {/* The two things that can be waiting on you lead, because they are the
          only entries here that are ever urgent. */}
      <Section heading="Waiting on you">
        {WAITING.map((item) => (
          <Row key={item.href} item={item} count={counts[item.href] ?? 0} />
        ))}
      </Section>

      {groups.map((group) => (
        <Section key={group.heading} heading={group.heading} note={group.note}>
          {group.items.map((item) => (
            <Row key={`${group.heading}-${item.href}`} item={item} count={counts[item.href] ?? 0} />
          ))}
        </Section>
      ))}

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </>
  );
}

function Section({
  heading,
  note,
  children,
}: {
  heading: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <p className="eyebrow-text mb-1">{heading}</p>
      {note ? <p className="caption-text mb-2 text-text-subtle">{note}</p> : null}
      {/* One hairline-divided list per group rather than one card per link.
          Twenty-two separate cards was most of what made this screen a wall. */}
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        {children}
      </ul>
    </section>
  );
}

function Row({
  item,
  count,
}: {
  item: { href: string; label: string; blurb?: string; icon: React.ComponentType<{ size?: number; className?: string }> };
  count: number;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <Icon size={17} className="shrink-0 text-text-subtle" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{item.label}</span>
          {item.blurb ? (
            <span className="caption-text block truncate text-text-muted">{item.blurb}</span>
          ) : null}
        </span>
        {count > 0 ? (
          <span className="tabular shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-fg">
            {count}
          </span>
        ) : null}
        <ChevronRight size={15} className="shrink-0 text-text-subtle" aria-hidden />
      </Link>
    </li>
  );
}
