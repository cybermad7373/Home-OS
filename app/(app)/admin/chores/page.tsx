import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TemplateAdmin } from "@/components/chores/template-admin";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { listTemplates, nextWeekStart } from "@/lib/data/chores";
import { houseToday } from "@/lib/utils/date";

export const metadata: Metadata = { title: "Chore list" };

export default async function ChoreTemplatesPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);

  // Hiding admin UI is presentation, not security — the API and the RLS policy
  // both refuse a non-admin write regardless of what renders.
  if (!context.isAdmin) redirect("/chores");

  const templates = await listTemplates(session, context.house.id);
  const activeMembers = context.members.filter((member) => member.status === "active");

  return (
    <>
      <PageHeader
        title="Chore list"
        subtitle="What the house has decided needs doing, and what each job is worth"
      />
      <TemplateAdmin
        templates={templates}
        rooms={context.rooms}
        memberCount={activeMembers.length}
        weekStart={nextWeekStart(houseToday(context.house.timezone))}
        isAdmin={context.isAdmin}
      />
    </>
  );
}
