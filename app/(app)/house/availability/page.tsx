import type { Metadata } from "next";
import { AvailabilityForm } from "@/components/house/availability-form";
import { PageHeader } from "@/components/layout/page-header";
import { getAvailability } from "@/lib/data/availability";
import { getHouseContext, requireSession } from "@/lib/data/house";

export const metadata: Metadata = { title: "My week" };

export default async function AvailabilityPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const days = await getAvailability(session, context.house.id, context.me.id);

  return (
    <>
      <PageHeader
        title="My week"
        subtitle="When the house can call on you, and when it cannot"
      />
      <AvailabilityForm initialDays={days} />
    </>
  );
}
