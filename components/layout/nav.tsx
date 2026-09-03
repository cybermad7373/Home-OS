"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  PRIMARY,
  WAITING,
  activeHref,
  visibleGroups,
  type Destination,
  type HomeShape,
} from "./destinations";
import { QuickAddSheet, quickAddOptions } from "./quick-add";

/**
 * Navigation, rebuilt in 3.0 around one idea: **the bar never changes.**
 *
 * The 2.0 bar had five fixed slots plus a sixth that swapped Insights out for
 * Approvals whenever anything was pending, so the control under your thumb
 * moved depending on the state of the house — and Insights disappeared entirely
 * below 640px. The two things that can be waiting on you are in the header now
 * (`app-header.tsx`), where they are visible from every screen. What is left is
 * five destinations and the add button, identical everywhere, always.
 *
 * The bar, the sidebar, `/more` and the command palette all render from
 * `destinations.ts`, so they cannot disagree about what exists or what it is
 * called. Before this they did: Food was a bottom tab, a sidebar group and a
 * More card, three ways to the same screen.
 */

/** Five on the bar. Insights is the sixth primary destination and lives in the sidebar and More. */
const BAR = PRIMARY.filter((item) => item.href !== "/insights");

export function BottomTabBar({
  isAdmin = false,
  isLead = false,
}: {
  isAdmin?: boolean;
  isLead?: boolean;
}) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);
  const active = activeHref(
    pathname,
    BAR.map((item) => item.href),
  );

  const left = BAR.slice(0, 2);
  const right = BAR.slice(2);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-lg items-end justify-around px-1">
          {left.map((item) => (
            <TabLink key={item.href} item={item} active={active === item.href} />
          ))}

          <li className="relative -top-3">
            {/*
              The raised centre button — the universal quick-add, and the
              most-used control in the app. It opens a sheet rather than
              navigating, because "add" is one of four things a member might
              mean and five to seven things a lead might.
            */}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Add"
              aria-haspopup="dialog"
              aria-expanded={addOpen}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full",
                "bg-primary text-primary-fg shadow-[var(--elev-3)]",
                "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)] active:scale-95",
              )}
            >
              <Plus size={24} aria-hidden />
            </button>
          </li>

          {right.map((item) => (
            <TabLink key={item.href} item={item} active={active === item.href} />
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

function TabLink({ item, active }: { item: Destination; active: boolean }) {
  const Icon = item.icon;
  return (
    <li className="flex-1">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "touch-target flex flex-col items-center justify-center gap-1 py-2 text-[10px] tracking-[0.04em]",
          "transition-colors duration-[var(--duration-fast)]",
          active ? "text-text" : "text-text-subtle",
        )}
      >
        <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
        {item.label}
      </Link>
    </li>
  );
}

/**
 * The desktop sidebar.
 *
 * The 2.0 version was thirty plain text links in seven always-open groups, with
 * no icons and no way to collapse anything — a wall, and the reason people
 * stopped reading it. This one leads with the same six primary destinations the
 * bar has, then the grouped rest, each group collapsible and closed by default
 * unless you are standing inside it.
 */
export function Sidebar({
  shape,
  memberName,
  standingLine = null,
  isAdmin = false,
  isLead = false,
  pendingApprovals = 0,
  unreadNotifications = 0,
}: {
  shape: HomeShape;
  memberName: string;
  standingLine?: string | null;
  isAdmin?: boolean;
  isLead?: boolean;
  pendingApprovals?: number;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);
  const groups = visibleGroups(shape);

  const everything = [
    ...PRIMARY,
    ...WAITING,
    ...groups.flatMap((group) => group.items),
  ];
  const active = activeHref(
    pathname,
    everything.map((item) => item.href),
  );

  const countFor = (item: Destination) =>
    item.badge === "approvals"
      ? pendingApprovals
      : item.badge === "notifications"
        ? unreadNotifications
        : 0;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
      <div className="sticky top-0 flex max-h-dvh flex-col gap-4 overflow-y-auto p-4">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={addOpen}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-[15px] font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          <Plus size={18} aria-hidden />
          Add
        </button>

        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {PRIMARY.map((item) => (
            <SidebarLink key={item.href} item={item} active={active === item.href} count={0} />
          ))}
        </nav>

        <div className="flex flex-col gap-0.5">
          <p className="eyebrow-text px-3 pb-1">Waiting</p>
          {WAITING.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={active === item.href}
              count={countFor(item)}
            />
          ))}
        </div>

        {groups.map((group) => {
          const insideThisGroup = group.items.some((item) => item.href === active);
          return (
            <details key={group.heading} open={insideThisGroup} className="group">
              <summary className="eyebrow-text flex cursor-pointer list-none items-center gap-1 px-3 py-1 hover:text-text-muted">
                <ChevronDown
                  size={12}
                  className="transition-transform duration-[var(--duration-fast)] group-open:rotate-0 -rotate-90"
                  aria-hidden
                />
                {group.heading}
              </summary>
              <div className="mt-0.5 flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={active === item.href}
                    count={countFor(item)}
                  />
                ))}
              </div>
            </details>
          );
        })}

        <div className="mt-auto border-t border-border pt-3">
          <p className="caption-text truncate text-text-muted">{memberName}</p>
          {standingLine ? (
            <p className="caption-text text-text-subtle">{standingLine}</p>
          ) : null}
        </div>
      </div>

      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        options={quickAddOptions({ isAdmin, isLead })}
      />
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  count,
}: {
  item: Destination;
  active: boolean;
  count: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-full px-3 py-2 text-[14px] transition-colors",
        active
          ? "bg-primary text-primary-fg"
          : "text-text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <Icon size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 ? (
        <span
          className={cn(
            "tabular shrink-0 rounded-full px-1.5 text-[10px] font-semibold leading-4",
            active ? "bg-primary-fg text-primary" : "bg-primary text-primary-fg",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
