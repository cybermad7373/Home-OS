"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Filter chips.
 *
 * A row of them replaces the select element that four screens were using for a
 * choice between three options — a dropdown hides its own options, which is the
 * wrong trade when there are three of them and one is already chosen.
 *
 * The selected state carries a tick as well as a fill, because status is never
 * conveyed by colour alone (docs/08-UI-UX-SPEC.md section 7).
 */
export function Chip({
  selected,
  count,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(chipClass(selected), className)}
      {...props}
    >
      {selected ? <Check size={13} aria-hidden /> : null}
      {children}
      {count !== undefined ? <ChipCount count={count} selected={selected} /> : null}
    </button>
  );
}

/** The same control where the filter lives in the URL rather than in state. */
export function ChipLink({
  href,
  selected,
  count,
  children,
  className,
}: {
  href: string;
  selected?: boolean;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(chipClass(selected), className)}
    >
      {selected ? <Check size={13} aria-hidden /> : null}
      {children}
      {count !== undefined ? <ChipCount count={count} selected={selected} /> : null}
    </Link>
  );
}

function chipClass(selected?: boolean) {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
    "text-[13px] font-medium transition-colors duration-[var(--duration-fast)]",
    selected
      ? "border-primary bg-primary-soft text-primary"
      : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text",
  );
}

function ChipCount({ count, selected }: { count: number; selected?: boolean }) {
  return (
    <span className={cn("tabular text-[11px]", selected ? "text-primary" : "text-text-subtle")}>
      {count}
    </span>
  );
}

/** A scrolling row of chips that never widens the page. */
export function ChipRow({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("scroll-x flex gap-2 py-1", className)}>
      {children}
    </div>
  );
}
