import Link from "next/link";
import { Bell } from "lucide-react";

/**
 * The bell from the dashboard mock in docs/08-UI-UX-SPEC.md section 4.2.
 *
 * A count, not a dot: "3" tells you whether to look now, and a dot does not.
 * The count is capped at 99 so a member returning from a fortnight away gets a
 * button rather than a paragraph.
 *
 * A server component on purpose — it renders from a figure the page already
 * fetched, so the bell costs no round trip of its own.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const label =
    unread === 0
      ? "Notifications"
      : `Notifications, ${unread} unread`;

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      <Bell size={20} aria-hidden />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 min-w-[18px] rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-[18px] text-primary-fg"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
