"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Two ways of switching between views, and they are not interchangeable.
 *
 * `Tabs` is for panels inside one screen — the state is local and the URL does
 * not change. `LinkTabs` is for views that are separate routes, because a
 * person who wants to send somebody "the chores I owe" should be able to send a
 * link that opens there.
 *
 * Both render a real tab semantic, so a screen reader announces "tab 2 of 4"
 * rather than reading four unrelated buttons.
 */

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  // Arrow keys move between tabs, which is what the role promises. Without
  // this the semantics are a lie.
  function onKeyDown(event: React.KeyboardEvent) {
    const index = items.findIndex((item) => item.id === active);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[items[next].id]?.focus();
  }

  return (
    <div role="tablist" className={cn("scroll-x flex gap-1 border-b border-border", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          ref={(node) => {
            refs.current[item.id] = node;
          }}
          type="button"
          role="tab"
          aria-selected={item.id === active}
          tabIndex={item.id === active ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={onKeyDown}
          className={cn(
            "relative -mb-px shrink-0 px-3 py-2.5 text-[14px] font-medium transition-colors",
            "border-b-2",
            item.id === active
              ? "border-primary text-text"
              : "border-transparent text-text-muted hover:text-text",
          )}
        >
          {item.label}
          {item.count !== undefined ? <TabCount count={item.count} /> : null}
        </button>
      ))}
    </div>
  );
}

export function LinkTabs({
  items,
  active,
  className,
}: {
  items: (TabItem & { href: string })[];
  active: string;
  className?: string;
}) {
  return (
    <nav className={cn("scroll-x flex gap-1 border-b border-border", className)}>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.id === active ? "page" : undefined}
          className={cn(
            "relative -mb-px shrink-0 border-b-2 px-3 py-2.5 text-[14px] font-medium transition-colors",
            item.id === active
              ? "border-primary text-text"
              : "border-transparent text-text-muted hover:text-text",
          )}
        >
          {item.label}
          {item.count !== undefined ? <TabCount count={item.count} /> : null}
        </Link>
      ))}
    </nav>
  );
}

/** A count, never a dot: "three things" and "one thing" are different decisions. */
function TabCount({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "tabular ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] leading-4",
        count > 0 ? "bg-primary-soft text-primary" : "bg-surface-2 text-text-subtle",
      )}
    >
      {count}
    </span>
  );
}

/**
 * A segmented control — for switching the *shape* of one view rather than
 * moving between views. Day / week / month, not chores / money / food.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        // `w-fit` as well as `inline-flex`: inside a flex column the default
        // `align-items: stretch` would pull an inline-flex control full width.
        "inline-flex w-fit rounded-full border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] font-medium transition-all",
            "duration-[var(--duration-fast)] ease-[var(--ease-out)]",
            option.value === value
              ? "bg-primary text-primary-fg"
              : "text-text-muted hover:text-text",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
