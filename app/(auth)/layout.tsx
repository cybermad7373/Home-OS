import type { ReactNode } from "react";
import Link from "next/link";
import { Analytics } from "@/components/layout/analytics";
import { CookieNotice } from "@/components/layout/cookie-notice";
import { CreatorCredit } from "@/components/layout/creator-credit";

/**
 * The first screen anybody sees, and the only place the product introduces
 * itself.
 *
 * It was a centred title and a line of grey text on a blank page — correct,
 * and indistinguishable from a half-built prototype. The dot grid behind it is
 * the same one the empty states use, the wordmark is set in the technical
 * label, and the live dot is the one place besides an urgent count where the
 * accent red is spent. Nothing here is decoration for its own sake: it is the
 * design system's own vocabulary, on the screen that has to establish it.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell dot-grid flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        {/*
          `auth-hero` shrinks on a short window. The three-line statement at
          44px plus its margin is 200px of the screen, which on a 1366x768
          laptop at Windows' default 125% scaling — a 614px viewport — pushed
          Create account below the fold on the sign-up form. A promise nobody
          scrolls to is not worth the button it hides.
        */}
        <div className="auth-hero mb-8">
          <p className="flex items-center gap-2">
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="eyebrow-text text-text">HouseOS</span>
          </p>
          <p className="display-xl mt-3 leading-[1.05]">
            The work
            <br />
            and the money,
            <br />
            both visible.
          </p>
        </div>
        {children}

        <CookieNotice />

        {/*
          Reachable before there is an account. A person deciding whether to
          sign up is exactly the person who wants to read what the product does
          with a household's money, and a store reviewer has no other way in.
        */}
        <nav
          aria-label="Documents"
          className="auth-docs mt-8 flex items-center justify-center gap-5"
        >
          <Link href="/legal/privacy" className="tap-44 caption-text text-text-muted hover:text-text">
            Privacy
          </Link>
          <Link href="/legal/terms" className="tap-44 caption-text text-text-muted hover:text-text">
            Terms
          </Link>
          <Link href="/legal/support" className="tap-44 caption-text text-text-muted hover:text-text">
            Support
          </Link>
        </nav>
        <CreatorCredit className="mt-4 text-center" />
      </div>

      <Analytics />
    </main>
  );
}
