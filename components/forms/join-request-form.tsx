"use client";

import { useState } from "react";
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

      <Button type="submit" block loading={loading}>
        Ask to join {houseName}
      </Button>
    </form>
  );
}
