import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";

/**
 * The number is set in the display face, because a dot-matrix 404 is the one
 * place this design system's voice can be used for something other than money
 * without diluting it: it is a code, and a code is what the readout is for.
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
      <Link href="/home" className={buttonVariants({ className: "mt-2" })}>
        Back to home
      </Link>
    </main>
  );
}
