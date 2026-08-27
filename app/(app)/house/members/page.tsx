import type { Metadata } from "next";
import { MemberList } from "@/components/house/member-list";
import { PageHeader } from "@/components/layout/page-header";
import { getHouseContext, requireSession } from "@/lib/data/house";
import { formatInviteCode } from "@/lib/utils/invite-code";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const session = await requireSession();
  const context = await getHouseContext(session);
  const activeCount = context.members.filter(
    (member) => member.status === "active",
  ).length;

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={
          context.isAdmin
            ? `Invite code ${formatInviteCode(context.house.invite_code)}`
            : `${activeCount} ${activeCount === 1 ? "person" : "people"}`
        }
      />
      <MemberList
        members={context.members}
        isAdmin={context.isAdmin}
        currentMemberId={context.me.id}
        isFamily={context.shape.isFamily}
      />
    </>
  );
}
