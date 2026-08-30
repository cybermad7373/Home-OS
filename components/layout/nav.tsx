"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CheckSquare,
  Home,
  IndianRupee,
  Plus,
  ShieldCheck,
  Sun,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { HomeSwitcher, type HomeOption } from "@/components/homes/home-switcher";
import { QuickAddSheet, quickAddOptions } from "./quick-add";

/**
 * Navigation — docs/08-UI-UX-SPEC.md section 3, rewritten in 2.0.
 *
 * Six primary destinations on mobile, one of which — Add — is a control rather
 * than a place: Home, Today, Chores, **Add**, Money, Food. The five-item bar
 * this replaces had no Today and no Food, and its Home tab was `/dashboard`.
 *
 * Two destinations have no fixed slot (section 3.1):
 *
 *   * **Insights** is the only primary destination that is never urgent, so it
 *     is the one that yields the slot. It is in More below 640 px and a primary
 *     item from 640 px up.
 *   * **Approvals** takes that same slot, with its count, the moment anything
 *     is waiting on the caller (AP-05), and returns to More when the queue
 *     empties. It is shown at every width, not only from 640 px: section 3.1
 *     caps the bar at six items *and* says the one thing never to drop is
 *     Approvals while something is pending, and the phase's own acceptance
 *     criterion is that Approvals appears in primary navigation the moment
 *     anything is. Where those two disagree, the pending queue wins.
 */

interface Tab {
  href: string;
  label: string;
  icon: typeof Home;
  badge?: number;
  /** Rendered only from 640 px up. */
  wideOnly?: boolean;
}

const PRIMARY: Tab[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/chores", label: "Chores", icon: CheckSquare },
  { href: "/expenses", label: "Money", icon: IndianRupee },
  { href: "/food", label: "Food", icon: UtensilsCrossed },
];

function yieldingTab(pendingApprovals: number): Tab {
  return pendingApprovals > 0
    ? {
        href: "/more/approvals",
        label: "Approvals",
        icon: ShieldCheck,
        badge: pendingApprovals,
      }
    : { href: "/insights", label: "Insights", icon: BarChart3, wideOnly: true };
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The longest matching destination wins, so standing on `/more/approvals`
 * lights Approvals rather than both it and More.
 */
function activeHref(pathname: string, hrefs: string[]): string | null {
  return hrefs
    .filter((href) => isActive(pathname, href))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

export function BottomTabBar({
  pendingApprovals = 0,
  isAdmin = false,
  isLead = false,
}: {
  pendingApprovals?: number;
  isAdmin?: boolean;
  isLead?: boolean;
}) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);

  const tabs = [...PRIMARY, yieldingTab(pendingApprovals)];
  const active = activeHref(
    pathname,
    tabs.map((tab) => tab.href),
  );

  // Three on the left of the raised button, the rest on the right. The split is
  // by position rather than by count so the button stays centred whether or not
  // the yielding slot is showing.
  const left = tabs.slice(0, 3);
  const right = tabs.slice(3);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-lg items-end justify-around px-1">
          {left.map((tab) => (
            <TabLink key={tab.href} {...tab} active={active === tab.href} />
          ))}

          <li className="relative -top-3">
            {/*
              The raised centre button — the universal quick-add (section 3.6),
              and the most-used control in the app. It opens the sheet rather
              than navigating, because "add an expense" is one of four things a
              member might mean and five to seven things a lead might.
            */}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Add"
              aria-haspopup="dialog"
              aria-expanded={addOpen}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[0_4px_12px_rgb(0_0_0/0.08)]"
            >
              <Plus size={24} aria-hidden />
            </button>
          </li>

          {right.map((tab) => (
            <TabLink key={tab.href} {...tab} active={active === tab.href} />
          ))}
        </ul>
      </nav>

      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        options={quickAddOptions({ isAdmin, isLead })}
      />
    </>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  wideOnly,
}: Tab & { active: boolean }) {
  return (
    <li className={cn("flex-1", wideOnly && "hidden min-[640px]:block")}>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={badge ? `${label}, ${badge} waiting on you` : undefined}
        className={cn(
          "touch-target flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]",
          active ? "text-primary" : "text-text-muted",
        )}
      >
        <span className="relative">
          <Icon size={20} aria-hidden />
          {/* A count, never a dot: "three things" and "one thing" are
              different decisions about whether to tap (section 3.3). */}
          {badge ? (
            <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-fg">
              {badge}
            </span>
          ) : null}
        </span>
        {label}
      </Link>
    </li>
  );
}

interface NavLink {
  href: string;
  label: string;
}

interface NavGroup {
  heading: string;
  links: NavLink[];
}

/**
 * The desktop sidebar — section 3.5. The same destinations as the bar, with
 * More's sub-items promoted to visible entries and Insights always visible.
 *
 * Two links are conditional, and both for the same reason: a screen that cannot
 * ever say anything is worse than a missing one. Settling up in a pot household
 * would always read "nobody owes anybody", and a standing table in a rota
 * household would show scores the house has asked not to see.
 */
function sidebarGroups({
  isPot,
  isRota,
  isAdmin,
}: {
  isPot: boolean;
  isRota: boolean;
  isAdmin: boolean;
}): NavGroup[] {
  return [
    {
      heading: "Primary",
      links: [
        { href: "/home", label: "Home" },
        { href: "/today", label: "Today" },
        { href: "/chores", label: "Chores" },
        { href: "/expenses", label: "Money" },
        { href: "/food", label: "Food" },
        { href: "/insights", label: "Insights" },
      ],
    },
    {
      heading: "Waiting",
      links: [
        { href: "/more/approvals", label: "Approvals" },
        { href: "/more/decisions", label: "Decisions" },
        { href: "/expenses/approvals", label: "Expense approvals" },
        { href: "/notifications", label: "Notifications" },
      ],
    },
    {
      heading: "Chores",
      links: [
        { href: "/chores/mine", label: "My chores" },
        ...(isRota ? [] : [{ href: "/chores/standing", label: "Standing" }]),
      ],
    },
    {
      heading: "Money",
      links: [
        { href: "/money/daily", label: "Running cost" },
        ...(isPot ? [] : [{ href: "/settle", label: "Settle" }]),
        { href: "/expenses/recurring", label: "Recurring" },
        { href: "/house/categories", label: "Categories" },
      ],
    },
    {
      heading: "Food",
      links: [
        { href: "/food/library", label: "Library" },
        { href: "/food/shopping", label: "Shopping list" },
        { href: "/food/history", label: "Meal history" },
        { href: "/food/preferences", label: "Preferences" },
      ],
    },
    {
      heading: "The home",
      links: [
        { href: "/more/calendar", label: "Calendar" },
        { href: "/more/rules", label: "Rules" },
        { href: "/house/members", label: "Members" },
        { href: "/house/rooms", label: "Rooms" },
        { href: "/house/guests", label: "Guests" },
        { href: "/house/away", label: "Away days" },
        { href: "/homes", label: "My homes" },
        { href: "/more", label: "More" },
      ],
    },
    ...(isAdmin
      ? [
          {
            heading: "Admin",
            links: [
              { href: "/admin/chores", label: "Chore list" },
              { href: "/admin/schedule", label: "Schedule" },
              { href: "/admin/settings", label: "House settings" },
            ],
          },
        ]
      : []),
  ];
}

export function Sidebar({
  homes,
  selectedHouseId,
  memberName,
  isPot,
  isRota,
  isAdmin = false,
  isLead = false,
  pendingApprovals = 0,
  standingLine = null,
}: {
  homes: HomeOption[];
  selectedHouseId: string;
  memberName: string;
  isPot: boolean;
  isRota: boolean;
  isAdmin?: boolean;
  isLead?: boolean;
  pendingApprovals?: number;
  /** The caller's own effort standing, shown at the top of the sidebar. */
  standingLine?: string | null;
}) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);
  const groups = sidebarGroups({ isPot, isRota, isAdmin });
  const active = activeHref(
    pathname,
    groups.flatMap((group) => group.links.map((link) => link.href)),
  );

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
      <div className="sticky top-0 max-h-dvh overflow-y-auto p-4">
        <HomeSwitcher homes={homes} selectedId={selectedHouseId} />
        <p className="caption-text text-text-muted">Signed in as {memberName}</p>
        {standingLine ? (
          <p className="caption-text mb-3 text-text-muted">{standingLine}</p>
        ) : (
          <div className="mb-3" />
        )}

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={addOpen}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-3 py-2 text-[15px] font-medium text-primary-fg"
        >
          <Plus size={18} aria-hidden />
          Add
        </button>

        <nav aria-label="Primary">
          {groups.map((group) => (
            <div key={group.heading} className="mb-4">
              <p className="caption-text mb-1 px-3 uppercase tracking-wide text-text-subtle">
                {group.heading}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active === link.href ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-[10px] px-3 py-2 text-[15px]",
                        active === link.href
                          ? "bg-surface-2 font-medium text-primary"
                          : "text-text-muted hover:bg-surface-2 hover:text-text",
                      )}
                    >
                      {link.label}
                      {link.href === "/more/approvals" && pendingApprovals > 0 ? (
                        <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-medium leading-5 text-primary-fg">
                          {pendingApprovals}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        options={quickAddOptions({ isAdmin, isLead })}
      />
    </aside>
  );
}
