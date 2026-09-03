import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { BottomTabBar, Sidebar } from "@/components/layout/nav";
import type { HomeShape } from "@/components/layout/destinations";
import { PushRegistrar } from "@/components/notifications/push-registrar";
import { getHouseContext, getMembership, requireSession } from "@/lib/data/house";
import { listHomes, listOwnJoinRequests } from "@/lib/data/homes";
import { countDecisionsAwaiting } from "@/lib/data/governance";
import { getUnreadCount } from "@/lib/data/notifications";
import { getStanding, weekStartOf } from "@/lib/data/chores";
import { houseToday } from "@/lib/utils/date";

/**
 * The app shell. Everything inside it requires an active membership; a signed-in
 * user without one is sent back into onboarding rather than shown an error.
 *
 * The shell owns the two counts that used to be fetched per screen — approvals
 * and unread notifications — because in 3.0 they are rendered by the header on
 * every screen rather than by whichever page happened to want them.
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
  const [homes, pendingApprovals, unread, standing] = await Promise.all([
    listHomes(session, membership.house.id),
    countDecisionsAwaiting(session, membership.house.id, membership.member.id),
    getUnreadCount(session),
    // The caller's own effort standing, shown at the foot of the sidebar. A
    // rota household has asked not to be scored, so it gets nothing rather
    // than a zero.
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

  const shape: HomeShape = {
    isPot: context.shape.isPot,
    isRota: context.shape.effortMode === "rota",
    isAdmin: context.isAdmin,
    isLead: context.isLead,
    isFamily: context.shape.homeType === "family",
    gameLayer: context.settings.game_layer_enabled ?? false,
    hasDependents: context.members.some((member) => member.kind === "dependent"),
  };

  const homeOptions = homes.homes
    .filter((home) => home.status === "active")
    .map((home) => ({
      id: home.id,
      name: home.name,
      homeType: home.homeType,
      pendingCount: home.pendingCount,
    }));

  return (
    <div className="flex min-h-dvh flex-col">
      {/* The header spans the full width above the sidebar, so the Home
          switcher is in the same place at every width — on a phone it was
          previously unreachable, because the switcher lived only in the
          sidebar. */}
      <AppHeader
        homes={homeOptions}
        selectedHouseId={context.house.id}
        shape={shape}
        pendingApprovals={pendingApprovals}
        unreadNotifications={unread}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-1">
        <Sidebar
          shape={shape}
          memberName={context.me.displayName}
          standingLine={standingLine}
          isAdmin={context.isAdmin}
          isLead={context.isLead}
          pendingApprovals={pendingApprovals}
          unreadNotifications={unread}
        />
        {/*
          `min-w-0` is load-bearing. This is a flex item, so its default
          `min-width: auto` floors it at its own min-content width — and any
          descendant with `white-space: nowrap` (every `truncate` in the app has
          it) contributes its whole unwrapped line to that figure. Without this,
          one long username on /house/members pushed the entire page 177 px wider
          than a 360 px screen, and the truncation that was supposed to prevent
          exactly that never got the chance to run.
        */}
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-6 md:px-6 lg:pb-10">
            {children}
          </main>
        </div>
      </div>

      <BottomTabBar isAdmin={context.isAdmin} isLead={context.isLead} />
      <PushRegistrar vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
    </div>
  );
}
