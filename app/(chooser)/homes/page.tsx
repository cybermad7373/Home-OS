import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomeChooser } from "@/components/homes/home-chooser";
import { listHomes, listOwnJoinRequests } from "@/lib/data/homes";
import { getOwnProfile, listMemberships, requireSession } from "@/lib/data/house";
import { readSelectedHouseId } from "@/lib/infra/supabase/selected-house";

export const metadata: Metadata = {
  title: "Your homes",
  description:
    "Every home you belong to, what is waiting in each, and the two ways to gain another one.",
};

/**
 * S-51b — the Home chooser, and where signing in now lands.
 *
 * A person belongs to several Homes from phase 10 onward and exactly one is
 * selected at a time, but until this screen existed nothing ever *asked*. The
 * selection was a cookie, a fresh browser had none, and the fallback was
 * whichever membership the query returned first — so the app picked a Home on
 * your behalf, silently, and if it picked one you do not run you got a product
 * with every create control hidden and no explanation on screen.
 *
 * Choosing is now a screen rather than an inference. It also holds the two
 * actions that had nowhere to live: `/homes` used to tell people to "open an
 * invite link to join another" and offer no way to do it, and creating a
 * second Home was reachable only through onboarding, which a signed-in person
 * cannot get back to.
 */
export default async function HomesPage() {
  const session = await requireSession();

  // Same order as the app shell, for the same reason: a Google sign-in arrives
  // with no username, and everything downstream identifies people by one.
  const profile = await getOwnProfile(session);
  if (!profile?.username) redirect("/onboarding/username");

  const memberships = await listMemberships(session);

  // Nobody chooses from an empty list. Somebody with an open request is
  // waiting rather than starting over, and gets told so.
  if (memberships.length === 0) {
    const waiting = await listOwnJoinRequests(session);
    redirect(waiting.length > 0 ? "/onboarding/pending" : "/onboarding/house");
  }

  const selected = await readSelectedHouseId();
  const view = await listHomes(session, selected);

  const active = view.homes.filter((home) => home.status === "active").length;

  return (
    <>
      <div className="mb-6 mt-2">
        <h1 className="display-xl leading-[1.05]">Your homes</h1>
        <p className="caption-text mt-2 text-text-muted">
          {active === 0
            ? "Nothing has let you in yet. Create a home, or join one with the link you were sent."
            : active === 1
              ? "Go in, or set up another one."
              : `${active} homes. Pick the one you want to be in — you can switch at any time from the header.`}
        </p>
      </div>

      <HomeChooser homes={view.homes} selectedId={view.selectedHouseId} />
    </>
  );
}
