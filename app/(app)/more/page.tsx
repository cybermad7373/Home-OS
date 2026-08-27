import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { MemberAvatar } from "@/components/ui/avatar";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { HOUSEHOLD_TYPE_LABEL, RESIDENCY_LABEL } from "@/lib/types/domain";

export const metadata: Metadata = { title: "More" };

interface MoreLink {
  href: string;
  label: string;
  body: string;
}

/**
 * Two entries are conditional, for the same reason they are in the sidebar: a
 * pot household has nothing to settle, and a rota household has asked not to be
 * shown scores. Listing a screen that can only ever be empty teaches people to
 * stop reading the menu.
 */
function links({ isPot, isRota }: { isPot: boolean; isRota: boolean }): MoreLink[] {
  return [
    {
      href: "/notifications",
      label: "Notifications",
      body: "Everything the house has told you, and what it may interrupt you for",
    },
    {
      href: "/money/daily",
      label: "Running cost",
      body: "What the house costs a day, and whether that is more than it means to",
    },
    ...(isRota
      ? []
      : [
          {
            href: "/chores/standing",
            label: "House standing",
            body: "Who is carrying the house, and who is coasting",
          },
        ]),
    ...(isPot
      ? []
      : [
          {
            href: "/settle",
            label: "Settle up",
            body: "Who pays whom this month, and what is confirmed",
          },
        ]),
    {
      href: "/expenses/approvals",
      label: "Approvals",
      body: "Expenses waiting on somebody other than the payer",
    },
    {
      href: "/expenses/recurring",
      label: "Recurring expenses",
      body: "Rent, the electricity bill and the maid, posted automatically",
    },
    {
      href: "/house/categories",
      label: "Categories and budgets",
      body: "What the house buys, and what it means to spend on each",
    },
    {
      href: "/house/availability",
      label: "My week",
      body: "When the house can call on you, and when it cannot",
    },
    {
      href: "/house/away",
      label: "Away days",
      body: "Declare a day off — the schedule moves, and so does your target",
    },
    {
      href: "/house/guests",
      label: "Guests",
      body: "Who is staying, and whose bill and chores they are",
    },
    {
      href: "/house/members",
      label: "Members",
      body: "Everyone who lives here, accounts and dependents alike",
    },
    { href: "/house/rooms", label: "Rooms", body: "Rooms, rent and who sleeps where" },
    {
      href: "/house/notifications",
      label: "Notification settings",
      body: "What reaches you, quiet hours, and which devices",
    },
    { href: "/onboarding/profile", label: "My profile", body: "Cooking, UPI ID, your room" },
  ];
}

const ADMIN_LINKS = [
  {
    href: "/admin/chores",
    label: "Chore list",
    body: "What needs doing, and what each job is worth",
  },
  {
    href: "/admin/schedule",
    label: "Schedule runs",
    body: "Generate a week, and see how past ones were produced",
  },
  { href: "/admin/settings", label: "House settings", body: "Penalty rate, thresholds, invite code" },
];

export default async function MorePage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  return (
    <>
      <PageHeader title="More" />

      <Card className="mb-4 flex items-center gap-3">
        <MemberAvatar
          name={context.me.displayName}
          avatarUrl={context.me.avatarUrl}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{context.me.displayName}</p>
          <p className="caption-text text-text-muted">
            {context.me.username ? `@${context.me.username} · ` : ""}
            {context.house.name} · {HOUSEHOLD_TYPE_LABEL[context.shape.householdType]}{" "}
            · {RESIDENCY_LABEL[context.me.residency]}
          </p>
        </div>
      </Card>

      <nav aria-label="More">
        <ul className="flex flex-col gap-2">
          {[
            ...links({
              isPot: context.shape.isPot,
              isRota: context.shape.effortMode === "rota",
            }),
            ...(context.isAdmin ? ADMIN_LINKS : []),
          ].map((link) => (
            <li key={link.href}>
              <Link href={link.href}>
                <Card className="transition-colors hover:border-primary">
                  <p className="font-medium">{link.label}</p>
                  <p className="caption-text text-text-muted">{link.body}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 flex items-center justify-between gap-3">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </>
  );
}
