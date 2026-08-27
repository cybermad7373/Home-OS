import type { Metadata } from "next";
import { GuestList } from "@/components/house/guest-list";
import { PageHeader } from "@/components/layout/page-header";
import { listGuests } from "@/lib/data/guests";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Guests" };

export default async function GuestsPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const today = houseToday(context.house.timezone);
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 60);

  const guests = await listGuests(session, context.house.id, {
    from: today,
    to: horizon.toISOString().slice(0, 10),
  });

  return (
    <>
      <PageHeader
        title="Guests"
        subtitle="Who is staying, and whose bill and chores they are"
      />
      <GuestList
        initial={guests}
        myMemberId={context.me.id}
        isAdmin={context.isAdmin}
        today={today}
        timezone={context.house.timezone}
      />
    </>
  );
}
