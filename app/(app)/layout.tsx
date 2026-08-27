import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BottomTabBar, Sidebar } from "@/components/layout/nav";
import { PushRegistrar } from "@/components/notifications/push-registrar";
import { getHouseContext, getMembership, requireSession } from "@/lib/data/house";
import { listHomes, listOwnJoinRequests } from "@/lib/data/homes";

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
  const homes = await listHomes(session, membership.house.id);

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
      />
      <div className="flex-1">
        <main className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-6 md:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomTabBar />
      <PushRegistrar vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
    </div>
  );
}
