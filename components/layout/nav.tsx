"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckSquare,
  Home,
  IndianRupee,
  Menu,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { HomeSwitcher, type HomeOption } from "@/components/homes/home-switcher";

/**
 * Navigation — docs/08-UI-UX-SPEC.md section 3. Bottom tab bar on mobile, left
 * sidebar at ≥1024 px, same five destinations either way.
 */

const TABS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/chores", label: "Chores", icon: CheckSquare },
  { href: "/expenses", label: "Money", icon: IndianRupee },
  { href: "/more", label: "More", icon: Menu },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-end justify-around px-2">
        {TABS.slice(0, 2).map((tab) => (
          <TabLink key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}

        <li className="relative -top-3">
          {/*
            The raised centre button. It is the most-used control in the app and
            gets the most prominent position for that reason.
          */}
          <Link
            href="/expenses?add=1"
            aria-label="Add an expense"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[0_4px_12px_rgb(0_0_0/0.08)]"
          >
            <Plus size={24} aria-hidden />
          </Link>
        </li>

        {TABS.slice(2).map((tab) => (
          <TabLink key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}
      </ul>
    </nav>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "touch-target flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]",
          active ? "text-primary" : "text-text-muted",
        )}
      >
        <Icon size={20} aria-hidden />
        {label}
      </Link>
    </li>
  );
}

interface NavLink {
  href: string;
  label: string;
}

/**
 * Two links are conditional, and both for the same reason: a screen that cannot
 * ever say anything is worse than a missing one. Settling up in a pot household
 * would always read "nobody owes anybody", and a standing table in a rota
 * household would show scores the house has asked not to see.
 */
function sidebarLinks({
  isPot,
  isRota,
}: {
  isPot: boolean;
  isRota: boolean;
}): NavLink[] {
  return [
    { href: "/dashboard", label: "Home" },
    { href: "/notifications", label: "Notifications" },
    { href: "/chores", label: "Chores" },
    { href: "/chores/mine", label: "My chores" },
    ...(isRota ? [] : [{ href: "/chores/standing", label: "Standing" }]),
    { href: "/expenses", label: "Money" },
    { href: "/money/daily", label: "Running cost" },
    ...(isPot ? [] : [{ href: "/settle", label: "Settle" }]),
    { href: "/expenses/approvals", label: "Approvals" },
    { href: "/expenses/recurring", label: "Recurring" },
    { href: "/house/categories", label: "Categories" },
    { href: "/house/members", label: "Members" },
    { href: "/house/rooms", label: "Rooms" },
    { href: "/analytics", label: "Analytics" },
    { href: "/admin/chores", label: "Chore list" },
    { href: "/admin/schedule", label: "Schedule" },
    { href: "/admin/settings", label: "House settings" },
    { href: "/homes", label: "My homes" },
  ];
}

export function Sidebar({
  homes,
  selectedHouseId,
  memberName,
  isPot,
  isRota,
}: {
  homes: HomeOption[];
  selectedHouseId: string;
  memberName: string;
  isPot: boolean;
  isRota: boolean;
}) {
  const pathname = usePathname();
  const links = sidebarLinks({ isPot, isRota });

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
      <div className="sticky top-0 p-4">
        <HomeSwitcher homes={homes} selectedId={selectedHouseId} />
        <p className="caption-text mb-6 text-text-muted">Signed in as {memberName}</p>
        <nav aria-label="Primary">
          <ul className="flex flex-col gap-0.5">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(pathname, link.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-[10px] px-3 py-2 text-[15px]",
                    isActive(pathname, link.href)
                      ? "bg-surface-2 font-medium text-primary"
                      : "text-text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
