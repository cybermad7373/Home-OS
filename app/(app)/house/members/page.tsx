import type { Metadata } from "next";
import { MemberList } from "@/components/house/member-list";
import { JoinRequests } from "@/components/house/join-requests";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { countOpenJoinRequests, listJoinRequests } from "@/lib/data/homes";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const activeCount = context.members.filter(
    (member) => member.status === "active",
  ).length;

  // A lead answers the queue; everybody else is told only that it exists
  // (HM-07). Two different queries, because the difference is the point.
  const requests = context.isLead
    ? await listJoinRequests(session, context.house.id)
    : [];
  const waitingCount = context.isLead
    ? requests.length
    : await countOpenJoinRequests(session, context.house.id);

  const people = `${activeCount} ${activeCount === 1 ? "person" : "people"}`;

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={
          waitingCount > 0 ? `${people} · ${waitingCount} waiting` : people
        }
      />
      <JoinRequests requests={requests} />
      <MemberList
        members={context.members}
        isAdmin={context.isAdmin}
        currentMemberId={context.me.id}
        isFamily={context.shape.isFamily}
      />
    </>
  );
}
