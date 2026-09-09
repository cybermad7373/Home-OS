import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";

export const metadata: Metadata = {
  title: "Google sign-in is not available yet",
  description:
    "HouseOS does not offer Google sign-in yet. Create an account with a username, an email address and a password instead.",
};

/**
 * The Google button's landing page while the provider is off.
 *
 * Signing in with Google needs an OAuth client and the provider switched on
 * in Supabase Auth; neither exists yet. A button that fails at tap time reads
 * as a broken product, and a silently disabled one reads as a broken button —
 * so the button leads here, where the state is stated and the manual path is
 * one tap away. Delete this page and re-enable the handler in
 * `components/forms/auth-form.tsx` when the provider is switched on.
 */
export default function GoogleUnavailablePage() {
  return (
    <Card>
      <h1 className="title-text mb-4">Google sign-in is not ready yet</h1>
      <p className="caption-text text-text-muted">
        There is no Google connection on this project yet, so continuing with
        Google cannot work. Create your account manually instead — a username
        you choose, your email address, and a password. It lands on the same
        account either way.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Link
          href="/signup"
          prefetch={false}
          className={buttonVariants({ block: true })}
        >
          Create an account manually
        </Link>
        <Link
          href="/signin"
          prefetch={false}
          className={buttonVariants({ variant: "outline", block: true })}
        >
          Back to sign in
        </Link>
      </div>
    </Card>
  );
}
