import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { JoinRequestForm } from "@/components/forms/join-request-form";
import { previewInvitation } from "@/lib/data/homes";
import { getSession } from "@/lib/data/house";
import { inviteTokenSchema } from "@/lib/validation/common";
import { HOME_TYPE_LABEL } from "@/lib/types/domain";

export const metadata: Metadata = { title: "Join a home" };

/**
 * The public invite-link landing page.
 *
 * Reachable with no account at all — it is what a stranger sees before they
 * sign in. It shows a name, a shape and a size, and possession of the link
 * grants nothing beyond that (SEC-15). An invalid, expired or revoked token
 * gets the same page as one that never existed, so this screen never confirms
 * that a home exists.
 */
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
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
        <Card>
          <CardTitle>This link is not valid</CardTitle>
          <CardDescription>
            It may have been replaced by a newer one. Ask whoever sent it for the
            current link.
          </CardDescription>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <Card>
        <CardTitle>{preview.houseName}</CardTitle>
        <CardDescription>
          {HOME_TYPE_LABEL[preview.homeType]} · {preview.memberCount}{" "}
          {preview.memberCount === 1 ? "person" : "people"}
        </CardDescription>

        {session ? (
          <div className="mt-4">
            <JoinRequestForm token={parsed.data!} houseName={preview.houseName} />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <p className="caption-text text-text-muted">
              Sign in to ask to join. Nobody is added to a home without asking.
            </p>
            <Link
              href={`/signin?next=/join/${encodeURIComponent(token)}`}
              className="rounded-xl bg-primary px-4 py-2.5 text-center font-medium text-primary-fg"
            >
              Sign in
            </Link>
            <Link
              href={`/signup?next=/join/${encodeURIComponent(token)}`}
              className="rounded-xl border border-border px-4 py-2.5 text-center font-medium"
            >
              Create an account
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
