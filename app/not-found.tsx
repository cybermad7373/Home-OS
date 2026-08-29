import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="title-text">That page does not exist</p>
      <p className="caption-text text-text-muted">
        It may have moved, or you may not be in the house that owns it.
      </p>
      <Link href="/home" className={buttonVariants({ className: "mt-2" })}>
        Back to home
      </Link>
    </main>
  );
}
