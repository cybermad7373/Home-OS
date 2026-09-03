"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** The error state every screen inherits: plain cause, a retry, detail hidden. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="dot-grid flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="display-xl text-text-subtle" aria-hidden>
        500
      </p>
      <p className="title-text">Something went wrong</p>
      <p className="caption-text max-w-[40ch] text-text-muted">
        The screen could not load. This is usually a connection problem rather than
        anything you did.
      </p>
      <Button className="mt-2" onClick={reset}>
        Try again
      </Button>
      <details className="caption-text mt-4 max-w-[40ch] text-text-subtle">
        <summary className="cursor-pointer">Details</summary>
        <p className="mt-1 break-words">{error.message}</p>
      </details>
    </main>
  );
}
