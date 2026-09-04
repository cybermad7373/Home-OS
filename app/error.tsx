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
      {/*
        The digest, not the message.
        
        Next redacts a server error's message in production and replaces it with
        a digest, which is the only thing that ties what a person saw to a line
        in the server log — so it is the one detail worth putting in front of
        them, and the one thing support will ask for. A client-side error's
        message is not redacted, and showing it here would undo the same
        information-disclosure fix the API just had: an internal string in front
        of whoever triggered it.
        
        In development the message is what you actually want, and there is
        nobody to disclose it to.
      */}
      {error.digest ? (
        <p className="caption-text mt-4 text-text-subtle">
          Reference <span className="tabular">{error.digest}</span>
        </p>
      ) : null}
      {process.env.NODE_ENV !== "production" ? (
        <details className="caption-text mt-2 max-w-[40ch] text-text-subtle">
          <summary className="cursor-pointer">Details (development only)</summary>
          <p className="mt-1 break-words">{error.message}</p>
        </details>
      ) : null}
    </main>
  );
}
