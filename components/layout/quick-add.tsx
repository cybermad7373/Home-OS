"use client";

import Link from "next/link";
import { BottomSheet } from "@/components/ui/sheet";

/**
 * The universal quick-add — docs/08-UI-UX-SPEC.md section 3.6.
 *
 * The sheet shows only what the caller may actually do. An option that opens
 * and then refuses is worse than an option that was never there, so the two
 * privileged groups are computed from the caller's role rather than shown
 * greyed out.
 */

export interface QuickAddOption {
  href: string;
  label: string;
  body: string;
}

/** Everybody. Four things any member of a Home can record about themselves. */
const MEMBER_OPTIONS: QuickAddOption[] = [
  { href: "/expenses?add=1", label: "Expense", body: "Something you paid for" },
  { href: "/food?add=1", label: "Meal", body: "What was eaten, and what it cost" },
  { href: "/chores/mine", label: "Chore done", body: "Mark one of yours off" },
  { href: "/house/away", label: "Absence", body: "A day you will not be here" },
];

/** A Co-Admin's two extra. */
const CO_ADMIN_OPTIONS: QuickAddOption[] = [
  { href: "/admin/chores", label: "Chore", body: "Add a job to the house's list" },
  { href: "/house/categories", label: "Category", body: "A new heading for spending" },
];

/** An Admin's three: the Co-Admin pair, plus rules. */
const ADMIN_ONLY_OPTIONS: QuickAddOption[] = [
  { href: "/more/rules/new", label: "Rule", body: "Something this home has agreed" },
];

export function quickAddOptions({
  isAdmin,
  isLead,
}: {
  isAdmin: boolean;
  isLead: boolean;
}): QuickAddOption[] {
  return [
    ...MEMBER_OPTIONS,
    ...(isLead ? CO_ADMIN_OPTIONS : []),
    ...(isAdmin ? ADMIN_ONLY_OPTIONS : []),
  ];
}

export function QuickAddSheet({
  open,
  onClose,
  options,
}: {
  open: boolean;
  onClose: () => void;
  options: QuickAddOption[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Add">
      <ul className="flex flex-col gap-2">
        {options.map((option) => (
          <li key={option.href}>
            <Link
              href={option.href}
              onClick={onClose}
              className="touch-target flex flex-col rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-3 hover:border-primary"
            >
              <span className="font-medium">{option.label}</span>
              <span className="caption-text text-text-muted">{option.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
