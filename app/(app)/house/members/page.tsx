import type { Metadata } from "next";
import { MemberList } from "@/components/house/member-list";
import { InvitePanel } from "@/components/house/invite-panel";
import { JoinRequests } from "@/components/house/join-requests";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import {
  countOpenJoinRequests,
  getLiveInvitation,
  inviteUrl,
  listJoinRequests,
} from "@/lib/data/homes";

export const metadata: Metadata = {
  title: "Members",
  description: "Everyone who lives here, accounts and dependents alike.",
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
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

  // The screen named after the question finally answers it. Inviting somebody
  // used to live only in the rail of /admin/settings, next to penalty rates —
  // so "how do I add a member" was answered by a screen about money.
  const invitation = context.isAdmin
    ? await getLiveInvitation(session, context.house.id)
    : null;

  const people = `${activeCount} ${activeCount === 1 ? "person" : "people"}`;

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={
          waitingCount > 0 ? `${people} · ${waitingCount} waiting` : people
        }
      />
      {context.isAdmin ? (
        <InvitePanel
          inviteUrl={invitation ? inviteUrl(invitation.token) : null}
          label="Invite somebody"
          className="mt-0"
        />
      ) : null}

      <JoinRequests requests={requests} />
      <MemberList
        openAddOnMount={add === "1"}
        members={context.members}
        isAdmin={context.isAdmin}
        currentMemberId={context.me.id}
        isFamily={context.shape.isFamily}
      />
    </>
  );
}
