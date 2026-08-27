import type { Metadata } from "next";
import { RoomList } from "@/components/house/room-list";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const totalRent = context.rooms.reduce(
    (sum, room) => sum + room.monthlyRentPaise,
    0,
  );

  return (
    <>
      <PageHeader
        title="Rooms"
        subtitle={
          context.rooms.length > 0
            ? `${formatMoney(totalRent, { currency: context.house.currency })} of rent a month`
            : undefined
        }
      />
      <RoomList
        rooms={context.rooms}
        members={context.members}
        currency={context.house.currency}
        isAdmin={context.isAdmin}
      />
    </>
  );
}
