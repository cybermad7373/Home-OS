import type { Metadata } from "next";
import { AwayDays } from "@/components/house/away-days";
import { PageHeader } from "@/components/layout/page-header";
import { listExceptions } from "@/lib/data/availability";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Away days" };

export default async function AwayDaysPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  const today = houseToday(context.house.timezone);
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 60);

  const exceptions = await listExceptions(session, context.house.id, {
    from: today,
    to: horizon.toISOString().slice(0, 10),
  });

  const nameByMember = new Map(
    context.members.map((member) => [member.id, member.displayName]),
  );

  return (
    <>
      <PageHeader
        title="Away days"
        subtitle="Tell the house before you go — the schedule adjusts, and your target with it"
      />
      <AwayDays
        initial={exceptions.map((exception) => ({
          ...exception,
          memberName: nameByMember.get(exception.memberId) ?? "Someone",
        }))}
        myMemberId={context.me.id}
        today={today}
        timezone={context.house.timezone}
      />
    </>
  );
}
