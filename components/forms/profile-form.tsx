"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";

/**
 * S-06 — the cooking flag and the optional UPI ID.
 *
 * The cooking answer is not cosmetic: it decides whether cooking chores can be
 * assigned to this member at all, which is why the screen says so.
 */
export function ProfileForm({
  initialCanCook,
  initialUpi,
  roomName,
  isOnboarding = false,
}: {
  initialCanCook: boolean;
  initialUpi: string;
  roomName: string | null;
  isOnboarding?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [canCook, setCanCook] = useState(initialCanCook);
  const [upi, setUpi] = useState(initialUpi);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ can_cook: canCook, upi_vpa: upi.trim() }),
    });
    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.details?.fields?.upi_vpa ?? body?.error?.message ?? "Something went wrong");
      return;
    }

    toast("Saved.", "success");
    // Onboarding continues to the availability step: a member whose first
    // generated week ignores their hours learns to ignore the schedule.
    router.push(isOnboarding ? "/onboarding/availability" : "/more");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <h1 className="title-text mb-4">A couple of things about you</h1>

        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        <fieldset className="mb-5">
          <legend className="label-text mb-1.5">Can you cook a full meal?</legend>
          <p className="caption-text mb-2 text-text-muted">
            This decides whether cooking chores can be assigned to you. Saying no means
            you carry the same points target through other work.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={canCook ? "primary" : "outline"}
              onClick={() => setCanCook(true)}
              aria-pressed={canCook}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant={canCook ? "outline" : "primary"}
              onClick={() => setCanCook(false)}
              aria-pressed={!canCook}
            >
              No
            </Button>
          </div>
        </fieldset>

        <Field
          label="Your room"
          htmlFor="room"
          hint="set by your admin"
        >
          <Input id="room" value={roomName ?? "Your admin will assign your room"} readOnly disabled />
        </Field>

        <Field
          label="UPI ID"
          htmlFor="upi"
          hint="optional"
        >
          <Input
            id="upi"
            value={upi}
            placeholder="name@bank"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setUpi(event.target.value)}
          />
          <p className="caption-text mt-1.5 text-text-muted">
            Used only to build a payment link at month end. Never sent anywhere else.
          </p>
        </Field>

        <Button type="submit" block loading={loading}>
          {isOnboarding ? "Finish" : "Save"}
        </Button>
      </form>
    </Card>
  );
}
