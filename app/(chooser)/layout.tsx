import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SignOutButton } from "@/components/layout/sign-out-button";

/**
 * The shell for the one screen that stands between signing in and being in a
 * Home.
 *
 * It is deliberately not the app shell. The sidebar, the tab bar and the
 * header's Home switcher all describe *a* Home — the one you are in — and
 * drawing them around a screen whose entire purpose is that you have not
 * chosen yet was how the old `/homes` managed to be a list of Homes rendered
 * inside one of them.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ChooserLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dot-grid flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <p className="flex items-center gap-2">
          <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="eyebrow-text text-text">HouseOS</span>
        </p>
        <SignOutButton />
      </header>

      {/* Centred from `md` up, and only there. This screen holds three or four
          cards, so on a desktop it is a short block that reads as abandoned
          when it clings to the top of a 900px window. On a phone the same
          centring would push the first card below the fold. */}
      <main className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-4 pb-16 pt-4 md:justify-center md:px-8 md:pb-24">
        {children}
      </main>
    </div>
  );
}
