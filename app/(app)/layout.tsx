import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BottomTabBar, Sidebar } from "@/components/layout/nav";
import { PushRegistrar } from "@/components/notifications/push-registrar";
import { getHouseContext, getMembership, requireSession } from "@/lib/data/house";
import { listHomes, listOwnJoinRequests } from "@/lib/data/homes";
import { countDecisionsAwaiting } from "@/lib/data/governance";
import { getStanding, weekStartOf } from "@/lib/data/chores";
import { houseToday } from "@/lib/utils/date";

/**
 * The app shell. Everything inside it requires an active membership; a signed-in
 * user without one is sent back into onboarding rather than shown an error.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const membership = await getMembership(session);

  // Three states, and they are not the same. Somebody with no membership at
  // all but an open request is waiting, not starting over — sending them to
  // "create a home" would be the app telling them their request never
  // happened.
  if (!membership) {
    const waiting = await listOwnJoinRequests(session);
    redirect(waiting.length > 0 ? "/onboarding/pending" : "/onboarding/house");
  }
  if (membership.member.status === "requested") redirect("/onboarding/pending");

  const context = await getHouseContext(session);
  const [homes, pendingApprovals, standing] = await Promise.all([
    listHomes(session, membership.house.id),
    // AP-05: Approvals is promoted into the bar the moment anything is waiting
    // on this person, and leaves it again when the queue empties.
    countDecisionsAwaiting(session, membership.house.id, membership.member.id),
    // Section 3.5 — the caller's own effort standing sits at the top of the
    // sidebar. A rota household has asked not to be scored, so it gets nothing
    // rather than a zero.
    getStanding(session, membership.house.id, weekStartOf(houseToday(membership.house.timezone))),
  ]);

  const myStanding = standing.find((row) => row.memberId === membership.member.id);
  const standingLine =
    context.shape.effortMode === "points" && myStanding
      ? `${myStanding.earnedPoints} of ${myStanding.targetPoints} points this week`
      : null;

  // A Google account that joined before usernames existed, or one whose name
  // was claimed in the gap during sign-up, has none yet.
  if (!context.me.username) redirect("/onboarding/username");

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        homes={homes.homes
          .filter((home) => home.status === "active")
          .map((home) => ({
            id: home.id,
            name: home.name,
            homeType: home.homeType,
            pendingCount: home.pendingCount,
          }))}
        selectedHouseId={context.house.id}
        memberName={context.me.displayName}
        isPot={context.shape.isPot}
        isRota={context.shape.effortMode === "rota"}
        isAdmin={context.isAdmin}
        isLead={context.isLead}
        pendingApprovals={pendingApprovals}
        standingLine={standingLine}
      />
      <div className="flex-1">
        <main className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-6 md:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomTabBar
        pendingApprovals={pendingApprovals}
        isAdmin={context.isAdmin}
        isLead={context.isLead}
      />
      <PushRegistrar vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
    </div>
  );
}
