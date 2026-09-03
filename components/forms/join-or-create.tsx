"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
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
            <CardTitle>I have an invite link</CardTitle>
            <CardDescription>
              Paste the link somebody sent you. You ask to join, and they let you
              in — nobody is added to a home without asking.
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

/**
 * Pulls the token out of whatever the person pasted.
 *
 * People paste the whole link, the link with a trailing space, or occasionally
 * just the token out of a message. All three are the same intent, and telling
 * somebody their perfectly good link is "invalid" because it has an https:// on
 * the front is the kind of thing that ends an onboarding.
 */
function tokenFrom(pasted: string): string | null {
  const trimmed = pasted.trim();
  if (!trimmed) return null;

  const fromUrl = trimmed.match(/\/join\/([A-Za-z0-9_-]{16,64})/);
  if (fromUrl) return fromUrl[1];

  return /^[A-Za-z0-9_-]{16,64}$/.test(trimmed) ? trimmed : null;
}

function JoinForm({ onBack, router }: { onBack: () => void; router: Router }) {
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const token = tokenFrom(pasted);
    if (!token) {
      setError("That does not look like an invite link");
      return;
    }
    setError(null);
    setLoading(true);

    // The landing page is the thing that names the home and asks for the
    // request, and it is public — so the link works whether the person is
    // signed in or not, and there is one place that flow lives.
    router.push(`/join/${token}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="title-text mb-4">Paste your invite link</h1>
      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Field
        label="Invite link"
        htmlFor="invite_link"
        hint="the whole link, exactly as they sent it"
        error={undefined}
      >
        <Input
          id="invite_link"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          placeholder="https://…/join/7Yk2…"
        />
      </Field>

      <Button type="submit" block loading={loading}>
        Continue
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

type HomeType = "shared" | "family";

/**
 * The choice that shapes everything else.
 *
 * It is asked here, in two sentences each, rather than buried in settings,
 * because getting it wrong is expensive to discover: a family that starts in
 * shared mode spends a month watching the app invent debts between a husband
 * and a wife, and concludes the app is not for them.
 */
const HOME_TYPES: {
  value: HomeType;
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
  const [homeType, setHomeType] = useState<HomeType>("shared");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
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
        home_type: homeType,
        // Optional, and used as context for food suggestions and nothing else
        // (HM-03, SEC-18). Omitted entirely when nothing was typed.
        ...(city.trim() || area.trim()
          ? {
              location: {
                ...(city.trim() ? { city: city.trim() } : {}),
                ...(area.trim() ? { area: area.trim() } : {}),
              },
            }
          : {}),
      }),
    });
    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body?.error?.details?.fields?.name ?? body?.error?.message ?? "Something went wrong");
      return;
    }

    // S-06b next: the optional AI step, which the admin may skip in one tap.
    // Straight to the profile. The AI key is configuration an admin has no
    // basis for deciding on before they have seen the app, and it is offered
    // again from Home and from house settings.
    router.push("/onboarding/profile");
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
          {HOME_TYPES.map((option) => {
            const selected = homeType === option.value;
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
                  name="home_type"
                  value={option.value}
                  checked={selected}
                  onChange={() => setHomeType(option.value)}
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
          You can change any of this later in home settings.
        </p>
      </fieldset>

      <Field label="Home name" htmlFor="name">
        <Input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={homeType === "family" ? "The Menon house" : "Anna Nagar Boys"}
        />
      </Field>

      <Field label="Address" htmlFor="address" hint="optional">
        <Input
          id="address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>

      <Field
        label="City"
        htmlFor="city"
        hint="optional — used only to suggest food that exists near you"
      >
        <Input
          id="city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Chennai"
        />
      </Field>

      <Field label="Area" htmlFor="area" hint="optional, and approximate">
        <Input
          id="area"
          value={area}
          onChange={(event) => setArea(event.target.value)}
          placeholder="Anna Nagar"
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
        {homeType === "family" ? "Create family home" : "Create home"}
      </Button>
      <Button type="button" variant="ghost" block className="mt-2" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}
