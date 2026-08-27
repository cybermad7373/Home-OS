import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationFeed } from "@/components/notifications/feed";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { getFeed } from "@/lib/data/notifications";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Notifications" };

/**
 * The feed — docs/11-NOTIFICATIONS-SPEC.md section 8.
 *
 * Not a log. Every actionable row carries its button, so the screen is the work
 * queue: a member who opens it and clears it has done everything the house is
 * waiting on them for.
 */
export default async function NotificationsPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const page = await getFeed(session, { limit: 50 });

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Everything the house has told you, whether or not your phone showed it"
        action={
          <Link
            href="/house/notifications"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Settings
          </Link>
        }
      />

      <NotificationFeed
        initial={page.items}
        initialCursor={page.nextCursor}
        timezone={context.house.timezone}
        today={houseToday(context.house.timezone)}
      />
    </>
  );
}
