"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { usernameSchema } from "@/lib/validation/common";

/**
 * The step a Google sign-in lands on. OAuth hands over a name and an email but
 * no username, and the house identifies people by username everywhere else, so
 * it is asked for once, here, before anything else.
 */
export function ClaimUsername({ suggestion }: { suggestion: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That username will not work");
      return;
    }

    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: parsed.data }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "That username will not work");
      return;
    }

    router.push("/onboarding/house");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <h1 className="title-text mb-2">Pick a username</h1>
        <p className="caption-text mb-4 text-text-muted">
          It has to be unique, and it is how you can sign in without Google later.
        </p>

        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        <Field
          label="Username"
          htmlFor="username"
          hint="3 to 20 characters"
        >
          <Input
            id="username"
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            value={username}
            invalid={Boolean(error)}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>

        <Button type="submit" block loading={loading}>
          Claim it
        </Button>
      </form>
    </Card>
  );
}
