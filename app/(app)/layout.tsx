import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BottomTabBar, Sidebar } from "@/components/layout/nav";
import { PushRegistrar } from "@/components/notifications/push-registrar";
import { getHouseContext, getMembership, requireSession } from "@/lib/data/house";

/**
 * The app shell. Everything inside it requires an active membership; a signed-in
 * user without one is sent back into onboarding rather than shown an error.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const membership = await getMembership(session);

  if (!membership) redirect("/onboarding/house");
  if (membership.member.status === "pending") redirect("/onboarding/pending");

  const context = await getHouseContext(session);

  // A Google account that joined before usernames existed, or one whose name
  // was claimed in the gap during sign-up, has none yet.
  if (!context.me.username) redirect("/onboarding/username");

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        houseName={context.house.name}
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
