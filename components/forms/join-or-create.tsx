"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatInviteCode, isValidInviteCode } from "@/lib/utils/invite-code";
import { cn } from "@/lib/utils/cn";

/** S-03 — join with a code, or create a house and become its admin. */
export function JoinOrCreate() {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "join" | "create">("choose");

  if (mode === "choose") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="title-text">Get started</h1>
        <p className="caption-text mb-2 text-text-muted">
          Join the house you have been invited to, or set one up and invite the others.
        </p>

        <button type="button" className="text-left" onClick={() => setMode("join")}>
          <Card className="transition-colors hover:border-primary">
            <CardTitle>I have an invite code</CardTitle>
            <CardDescription>
              Six characters from your house admin. They approve you after you join.
            </CardDescription>
          </Card>
        </button>

        <button type="button" className="text-left" onClick={() => setMode("create")}>
          <Card className="transition-colors hover:border-primary">
            <CardTitle>Set up a new home</CardTitle>
            <CardDescription>
              A shared flat or a family home. You become the admin: you set the
              rooms, the rules and who gets in.
            </CardDescription>
          </Card>
        </button>
      </div>
    );
  }

  return mode === "join" ? (
    <JoinForm onBack={() => setMode("choose")} router={router} />
  ) : (
    <CreateForm onBack={() => setMode("choose")} router={router} />
  );
}

type Router = ReturnType<typeof useRouter>;

function JoinForm({ onBack, router }: { onBack: () => void; router: Router }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidInviteCode(code)) {
      setError("That code isn't valid");
      return;
    }
    setLoading(true);
    setError(null);

    const response = await fetch("/api/houses/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: code }),
    });
    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "Something went wrong");
      return;
    }

    router.push(body.status === "active" ? "/dashboard" : "/onboarding/pending");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="title-text mb-4">Enter your invite code</h1>
      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Field
        label="Invite code"
        htmlFor="invite_code"
        hint="Looks like HN4-K2P"
        error={undefined}
      >
        <Input
          id="invite_code"
          value={formatInviteCode(code)}
          onChange={(event) => setCode(event.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          className="text-center text-[22px] tracking-[0.3em] uppercase"
        />
      </Field>

      <Button type="submit" block loading={loading}>
        Join house
      </Button>
      <Button type="button" variant="ghost" block className="mt-2" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
];

type HouseholdType = "shared" | "family";

/**
 * The choice that shapes everything else.
 *
 * It is asked here, in two sentences each, rather than buried in settings,
 * because getting it wrong is expensive to discover: a family that starts in
 * shared mode spends a month watching the app invent debts between a husband
 * and a wife, and concludes the app is not for them.
 */
const HOUSEHOLD_TYPES: {
  value: HouseholdType;
  title: string;
  body: string;
  detail: string;
}[] = [
  {
    value: "shared",
    title: "Flatmates sharing a place",
    body: "Everyone pays their own share, and the month ends with who owes whom.",
    detail: "Chores are scored, and falling behind costs money at month end.",
  },
  {
    value: "family",
    title: "A family home",
    body: "Spending comes out of one pot. Nobody ends the month owing anybody.",
    detail: "Chores are still shared out fairly — with no money attached.",
  },
];

function CreateForm({ onBack, router }: { onBack: () => void; router: Router }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [householdType, setHouseholdType] = useState<HouseholdType>("shared");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/houses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        address,
        timezone,
        currency: "INR",
        household_type: householdType,
      }),
    });
    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.details?.fields?.name ?? body?.error?.message ?? "Something went wrong");
      return;
    }

    // S-06b next: the optional AI step, which the admin may skip in one tap.
    router.push("/onboarding/ai");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="title-text mb-4">Set up your home</h1>
      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium">What kind of home is it?</legend>
        <div className="flex flex-col gap-2">
          {HOUSEHOLD_TYPES.map((option) => {
            const selected = householdType === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "block cursor-pointer rounded-xl border p-3 transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50",
                )}
              >
                <input
                  type="radio"
                  name="household_type"
                  value={option.value}
                  checked={selected}
                  onChange={() => setHouseholdType(option.value)}
                  className="sr-only"
                />
                <span className="block font-medium">{option.title}</span>
                <span className="caption-text mt-0.5 block text-text-muted">
                  {option.body}
                </span>
                <span className="caption-text mt-0.5 block text-text-muted">
                  {option.detail}
                </span>
              </label>
            );
          })}
        </div>
        <p className="caption-text mt-2 text-text-muted">
          You can change any of this later in house settings.
        </p>
      </fieldset>

      <Field label="House name" htmlFor="name">
        <Input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            householdType === "family" ? "The Menon house" : "Anna Nagar Boys"
          }
        />
      </Field>

      <Field label="Address" htmlFor="address" hint="optional">
        <Input
          id="address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>

      <Field label="Timezone" htmlFor="timezone" hint="all chore dates use this">
        <Select
          id="timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        >
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" block loading={loading}>
        {householdType === "family" ? "Create family home" : "Create house"}
      </Button>
      <Button type="button" variant="ghost" block className="mt-2" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}
