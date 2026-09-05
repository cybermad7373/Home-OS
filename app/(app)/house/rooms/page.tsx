import type { Metadata } from "next";
import { RoomList } from "@/components/house/room-list";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "Rooms",
  description:
    "Every room in the home, the rent it carries and who sleeps in it — the basis every rent split is worked out from.",
};

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
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
        openAddOnMount={add === "1"}
        rooms={context.rooms}
        members={context.members}
        currency={context.house.currency}
        isAdmin={context.isAdmin}
      />
    </>
  );
}
