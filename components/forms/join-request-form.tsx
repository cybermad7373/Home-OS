"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Asking to join — the only path to membership (HM-06).
 *
 * The message is optional and is the one thing the leads see besides a name,
 * so the hint asks for the sentence that actually helps them decide.
 */
export function JoinRequestForm({
  token,
  houseName,
}: {
  token: string;
  houseName: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * The invite link is the one page in the product a stranger lands on cold,
   * with nothing cached and nothing hydrated. A tap that arrives before
   * hydration submits the form the way a browser does with no JavaScript: a
   * GET to this same URL, which reloads the page and silently discards the
   * request the person believed they had sent. Disabled until the handler
   * exists is the honest state — pressing it earlier could never have worked.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch(`/api/join/${encodeURIComponent(token)}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "That did not work");
      return;
    }

    router.push("/onboarding/pending");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Field
        label="Say who you are"
        htmlFor="message"
        hint="optional — but it is all they will see besides your name"
      >
        <Input
          id="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={280}
          placeholder="Ruth's friend, moving in on the 1st"
        />
      </Field>

      <Button type="submit" block loading={loading} disabled={!ready}>
        Ask to join {houseName}
      </Button>
    </form>
  );
}
