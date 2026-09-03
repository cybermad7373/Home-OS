"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { HomeSwitcher, type HomeOption } from "@/components/homes/home-switcher";
import { CommandPalette } from "./command-palette";
import type { HomeShape } from "./destinations";

/**
 * The bar across the top of every screen, at every width.
 *
 * It exists to fix two things at once.
 *
 * The Home switcher was rendered only inside the desktop sidebar, so a member
 * of more than one home had no way to switch on a phone except by navigating to
 * `/homes` — a defect that could not show up until somebody belonged to two
 * homes, which until the three-home demo nobody did.
 *
 * And the bottom bar used to swap Insights out for Approvals whenever something
 * was pending, so the control under your thumb moved depending on the state of
 * the house. The two things that can be waiting on you live here now, next to
 * each other, visible from every screen. The bar below is the same six controls
 * always.
 */
export function AppHeader({
  homes,
  selectedHouseId,
  shape,
  pendingApprovals,
  unreadNotifications,
}: {
  homes: HomeOption[];
  selectedHouseId: string;
  shape: HomeShape;
  pendingApprovals: number;
  unreadNotifications: number;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K on a Mac, Ctrl+K everywhere else. `/` too, the way a search field is
  // reachable in every developer tool — but not while somebody is typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 md:px-6">
          <HomeSwitcher homes={homes} selectedId={selectedHouseId} />

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={cn(
              "hidden items-center gap-2 rounded-full border border-border bg-surface-2 py-1.5 pl-3 pr-2",
              "text-[13px] text-text-subtle transition-colors hover:border-border-strong hover:text-text-muted sm:flex",
            )}
            aria-label="Search the app"
          >
            <Search size={14} aria-hidden />
            <span>Search</span>
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-subtle">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search the app"
            className="touch-target flex items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:hidden"
          >
            <Search size={18} aria-hidden />
          </button>

          <HeaderAction
            href="/more/approvals"
            label="Approvals"
            count={pendingApprovals}
            icon={<ShieldCheck size={18} aria-hidden />}
            urgent
          />
          <HeaderAction
            href="/notifications"
            label="Notifications"
            count={unreadNotifications}
            icon={<Bell size={18} aria-hidden />}
          />
        </div>
      </header>

      {searchOpen ? (
        <CommandPalette
          onClose={() => setSearchOpen(false)}
          shape={shape}
          counts={{ approvals: pendingApprovals, notifications: unreadNotifications }}
        />
      ) : null}
    </>
  );
}

/**
 * A count, never a dot: "three things" and "one thing" are different decisions
 * about whether to tap (docs/08-UI-UX-SPEC.md section 3.3).
 *
 * Approvals is the one place the accent red is spent, because it is the only
 * indicator in the app that means somebody else is blocked on you.
 */
function HeaderAction({
  href,
  label,
  count,
  icon,
  urgent = false,
}: {
  href: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={count > 0 ? `${label}, ${count} waiting on you` : label}
      className="touch-target relative flex items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {icon}
      {count > 0 ? (
        <span
          className={cn(
            "tabular absolute right-1 top-1 min-w-[16px] rounded-full px-1 text-[10px] font-semibold leading-4",
            urgent ? "bg-accent text-accent-fg" : "bg-primary text-primary-fg",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
