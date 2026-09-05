"use client";

import Link from "next/link";
import { BottomSheet } from "@/components/ui/sheet";

/**
 * The universal quick-add — docs/08-UI-UX-SPEC.md section 3.6.
 *
 * The sheet shows only what the caller may actually do. An option that opens
 * and then refuses is worse than an option that was never there, so the
 * privileged groups are computed from the caller's role rather than shown
 * greyed out. (That is the opposite of what `LeadOnlyAction` does on a list
 * screen, and deliberately: a disabled control on the rooms screen teaches you
 * that rooms have an owner, while a disabled row in a menu you opened to *do
 * something* is an obstacle with no lesson in it.)
 *
 * It offered four things to a member and seven to an admin, and a Home creates
 * more than seven kinds of thing. Rooms, people, guests, recurring expenses,
 * announcements and shopping items were reachable only two or three taps down,
 * inside a sidebar section that is collapsed by default — so the one obvious
 * "make something" control in the app covered about a third of what a Home
 * actually makes. The list is now the whole surface, in two groups: what you
 * record about yourself, and what the home is set up with.
 */

export interface QuickAddOption {
  href: string;
  label: string;
  body: string;
}

export interface QuickAddGroup {
  heading: string;
  options: QuickAddOption[];
}

/** Everybody. What a person records about themselves and their own day. */
const MEMBER_OPTIONS: QuickAddOption[] = [
  { href: "/expenses?add=1", label: "Expense", body: "Something you paid for" },
  { href: "/food?add=1", label: "Meal", body: "What was eaten, and what it cost" },
  { href: "/chores/mine", label: "Chore done", body: "Mark one of yours off" },
  { href: "/house/away", label: "Absence", body: "A day you will not be here" },
  {
    href: "/food/shopping",
    label: "Shopping item",
    body: "Something the house needs bought",
  },
  {
    href: "/house/guests",
    label: "Guest",
    body: "Somebody staying — and whose bill and chores it lands on",
  },
];

/**
 * A Co-Admin's four: the things that shape the Home rather than record a day.
 */
const CO_ADMIN_OPTIONS: QuickAddOption[] = [
  { href: "/admin/chores", label: "Chore", body: "Add a job to the house's list" },
  {
    href: "/house/categories?add=1",
    label: "Category",
    body: "A new heading for spending",
  },
  {
    href: "/house/rooms?add=1",
    label: "Room",
    body: "A room, its rent and who sleeps in it",
  },
  {
    href: "/today?add=announcement",
    label: "Announcement",
    body: "Something everybody here needs to read",
  },
];

/** An Admin's three. */
const ADMIN_ONLY_OPTIONS: QuickAddOption[] = [
  { href: "/more/rules/new", label: "Rule", body: "Something this home has agreed" },
  {
    href: "/house/members?add=1",
    label: "Person",
    body: "Invite somebody, or add one who has no account",
  },
  {
    href: "/expenses/recurring?add=1",
    label: "Recurring expense",
    body: "Rent or a bill that posts itself",
  },
];

/**
 * Every home is on the list, always — the only option here that is about
 * somewhere other than where you are standing.
 */
const ANYWHERE_OPTIONS: QuickAddOption[] = [
  { href: "/homes", label: "Home", body: "Set up another one, or join one" },
];

export function quickAddOptions({
  isAdmin,
  isLead,
}: {
  isAdmin: boolean;
  isLead: boolean;
}): QuickAddOption[] {
  return quickAddGroups({ isAdmin, isLead }).flatMap((group) => group.options);
}

export function quickAddGroups({
  isAdmin,
  isLead,
}: {
  isAdmin: boolean;
  isLead: boolean;
}): QuickAddGroup[] {
  const setUp = [
    ...(isLead ? CO_ADMIN_OPTIONS : []),
    ...(isAdmin ? ADMIN_ONLY_OPTIONS : []),
  ];

  return [
    { heading: "Record", options: MEMBER_OPTIONS },
    ...(setUp.length > 0 ? [{ heading: "Set up", options: setUp }] : []),
    { heading: "Elsewhere", options: ANYWHERE_OPTIONS },
  ];
}

export function QuickAddSheet({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: QuickAddGroup[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Add" size="lg">
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.heading}>
            <p className="eyebrow-text mb-2 text-text-muted">{group.heading}</p>
            <ul className="flex flex-col gap-2">
              {group.options.map((option) => (
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
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
