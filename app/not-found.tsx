import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";

/**
 * The 404.
 *
 * Signed in, this is what an unknown path renders. Signed out, the proxy
 * answers an unknown path with a redirect to sign-in instead, and that is
 * deliberate rather than an omission: every path in this product is a private
 * household record, and a 404 that distinguishes "no such page" from "not
 * yours" tells a stranger which households and which screens exist. The
 * crawler-facing files — robots.txt, sitemap.xml — say what is public without
 * needing this page to.
 *
 * It sends people to the Home chooser rather than into a Home, because
 * somebody who followed a dead link may well have been aimed at a household
 * they are no longer in.
 */
export default function NotFound() {
  return (
    <main className="dot-grid flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="display-xl text-text-subtle" aria-hidden>
        404
      </p>
      <p className="title-text">That page does not exist</p>
      <p className="caption-text max-w-[40ch] text-text-muted">
        It may have moved, or you may not be in the house that owns it.
      </p>
      <Link href="/homes" className={buttonVariants({ className: "mt-2" })}>
        Your homes
      </Link>
    </main>
  );
}
