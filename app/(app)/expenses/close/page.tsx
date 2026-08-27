import type { Metadata } from "next";
import { CloseWizard } from "@/components/settle/close-wizard";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Close the month" };

export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const { period: requested } = await searchParams;

  const period = requested ?? houseToday(context.house.timezone).slice(0, 7);

  // Member ids map to names here, on the server, so the wizard never has to
  // fetch the roster separately just to label a row.
  const names = Object.fromEntries(
    context.members.map((member) => [member.id, member.displayName]),
  );

  return (
    <>
      <PageHeader
        title="Close the month"
        subtitle="Nothing is written until the last step"
      />
      <CloseWizard
        period={period}
        currency={context.house.currency}
        names={names}
        isAdmin={context.isAdmin}
        penaltyRatePaise={
          context.settings.penalty_enabled ? context.settings.penalty_rate_paise : 0
        }
      />
    </>
  );
}
