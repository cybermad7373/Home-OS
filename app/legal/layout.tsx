import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The two public documents a release needs: what the product does with your
 * data, and how to get help. They render with no session and no house, because
 * a person reads them before signing up and a store reviewer reads them without
 * an account at all.
 *
 * Deliberately plain. These are the only screens in the app whose job is to be
 * read rather than used, so they get a reading measure and nothing else.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[68ch] items-center justify-between px-4 py-4">
          <Link href="/" className="tap-44 heading-text">
            HouseOS
          </Link>
          <nav aria-label="Documents" className="flex items-center gap-4">
            <Link href="/legal/privacy" className="tap-44 text-[14px] text-text-muted hover:text-text">
              Privacy
            </Link>
            <Link href="/legal/support" className="tap-44 text-[14px] text-text-muted hover:text-text">
              Support
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[68ch] flex-1 px-4 py-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-[68ch] px-4 py-6">
          <p className="caption-text text-text-muted">
            HouseOS — a shared household record. <Link href="/signin" className="underline">Sign in</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
