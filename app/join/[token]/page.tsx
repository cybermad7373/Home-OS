import type { Metadata } from "next";
import Link from "next/link";
import { JoinRequestForm } from "@/components/forms/join-request-form";
import { buttonVariants } from "@/components/ui/button-variants";
import { previewInvitation } from "@/lib/data/homes";
import { getSession } from "@/lib/data/house";
import { inviteTokenSchema } from "@/lib/validation/common";
import { HOME_TYPE_LABEL } from "@/lib/types/domain";

export const metadata: Metadata = {
  title: "Join a home",
  description: "You have been invited to a home on HouseOS.",
};

/**
 * The public invite-link landing page.
 *
 * Reachable with no account at all — it is what a stranger sees before they
 * sign in. It shows a name, a shape and a size, and possession of the link
 * grants nothing beyond that (SEC-15). An invalid, expired or revoked token
 * gets the same page as one that never existed, so this screen never confirms
 * that a home exists.
 *
 * Redrawn for 3.0 to the same shell as sign-in, which is the other screen a
 * person meets before they have an account: the dot grid, the wordmark with
 * its live dot, and the home's own name set in the display face. It was a card
 * floating in the middle of a blank page with two hand-styled links that were
 * the only rounded rectangles left in the product.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="dot-grid flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <p className="mb-8 flex items-center gap-2">
          <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="eyebrow-text text-text">HouseOS</span>
        </p>
        {children}
      </div>
    </main>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parsed = inviteTokenSchema.safeParse(token);
  const preview = parsed.success ? await previewInvitation(parsed.data) : null;
  const session = await getSession();

  if (!preview) {
    return (
      <Shell>
        <h1 className="title-text mb-2">This link is not valid</h1>
        <p className="text-text-muted">
          It may have been replaced by a newer one. Ask whoever sent it for the
          current link.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="eyebrow-text">You have been invited to</p>
      <h1 className="display-number mt-2 leading-[1.05]">{preview.houseName}</h1>
      <p className="caption-text mt-2 text-text-muted">
        {HOME_TYPE_LABEL[preview.homeType]} · {preview.memberCount}{" "}
        {preview.memberCount === 1 ? "person" : "people"}
      </p>

      <div className="mt-8">
        {session ? (
          <JoinRequestForm token={parsed.data!} houseName={preview.houseName} />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="caption-text mb-1 text-text-muted">
              Sign in to ask to join. Nobody is added to a home without asking.
            </p>
            <Link
              href={`/signin?next=/join/${encodeURIComponent(token)}`}
              className={buttonVariants({ block: true })}
            >
              Sign in
            </Link>
            <Link
              href={`/signup?next=/join/${encodeURIComponent(token)}`}
              className={buttonVariants({ variant: "outline", block: true })}
            >
              Create an account
            </Link>
          </div>
        )}
      </div>
    </Shell>
  );
}
