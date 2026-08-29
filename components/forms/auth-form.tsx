"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@/lib/infra/supabase/client";
import { signInSchema, signUpSchema } from "@/lib/validation/house";

/**
 * Dev-only quick sign-in.
 *
 * Both halves have to be true: the build is not production, and the variables
 * are set. Next.js inlines NEXT_PUBLIC_ values at build time, so a production
 * build with them unset compiles this away to `false` and the button cannot
 * appear however the page is loaded.
 *
 * It is a real sign-in with a real account, not a bypass. Every screen reads
 * through RLS keyed on the session, so a faked session would show an empty app.
 */
const DEV_LOGIN =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_LOGIN_IDENTIFIER
    ? {
        identifier: process.env.NEXT_PUBLIC_DEV_LOGIN_IDENTIFIER,
        password: process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? "",
      }
    : null;

type Mode = "signin" | "signup";
type FieldKey = "display_name" | "username" | "email" | "identifier" | "password";
type Errors = Partial<Record<FieldKey | "form", string>>;

/**
 * S-01 and S-02.
 *
 * Three ways in, all landing on the same account: username and password, email
 * and password, or Google. Password sign-in and sign-up both go through the API
 * rather than straight to Supabase from the browser, because resolving a
 * username to an email needs the service-role key — see app/api/auth/signin.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/home";

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  // Prefilled in development so looking at the app is one tap, not a login.
  const [identifier, setIdentifier] = useState(
    mode === "signin" ? (DEV_LOGIN?.identifier ?? "") : "",
  );
  const [password, setPassword] = useState(
    mode === "signin" ? (DEV_LOGIN?.password ?? "") : "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const availability = useUsernameAvailability(mode === "signup" ? username : "");

  async function submit(credentials?: { identifier: string; password: string }) {
    setErrors({});

    const parsed =
      mode === "signup"
        ? signUpSchema.safeParse({
            display_name: displayName,
            username,
            email,
            password,
          })
        : signInSchema.safeParse(credentials ?? { identifier, password });

    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldKey;
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      const code = body?.error?.code;
      const message = body?.error?.message ?? "Something went wrong";
      if (code === "USERNAME_TAKEN") setErrors({ username: message });
      else if (code === "EMAIL_TAKEN" || code === "EMAIL_INVALID") {
        setErrors({ email: message });
      }
      else if (code === "VALIDATION_FAILED") {
        setErrors(body.error.details?.fields ?? { form: message });
      } else setErrors({ form: message });
      return;
    }

    if (mode === "signup" && body.needs_email_confirmation) {
      setConfirmationSent(true);
      return;
    }

    router.push(mode === "signup" ? "/onboarding/house" : next);
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await submit();
  }

  async function onGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setErrors({ form: "Google sign-in is not switched on for this project yet" });
  }

  if (confirmationSent) {
    return (
      <Card>
        <h1 className="title-text mb-2">Check your email</h1>
        <p className="text-text-muted">
          A confirmation link is on its way to{" "}
          <span className="font-medium text-text">{email}</span>. Open it, then sign in
          with <span className="font-medium text-text">{username}</span> or that email.
        </p>
        <Link href="/signin" className="caption-text mt-4 block text-primary">
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <h1 className="title-text mb-4">
          {mode === "signup" ? "Create your account" : "Sign in"}
        </h1>

        {errors.form ? (
          <div className="mb-4">
            <Alert tone="danger">{errors.form}</Alert>
          </div>
        ) : null}

        {mode === "signup" ? (
          <>
            <Field label="Display name" htmlFor="display_name" error={errors.display_name}>
              <Input
                id="display_name"
                name="display_name"
                autoComplete="name"
                value={displayName}
                invalid={Boolean(errors.display_name)}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>

            <Field
              label="Username"
              htmlFor="username"
              hint="unique, how the house signs you in"
              error={errors.username}
            >
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                invalid={Boolean(errors.username) || availability === "taken"}
                onChange={(event) => setUsername(event.target.value)}
              />
              <UsernameHint state={availability} username={username} />
            </Field>

            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                invalid={Boolean(errors.email)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field
            label="Username or email"
            htmlFor="identifier"
            error={errors.identifier}
          >
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              invalid={Boolean(errors.identifier)}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </Field>
        )}

        <Field
          label="Password"
          htmlFor="password"
          hint={mode === "signup" ? "8+ characters, a letter and a number" : undefined}
          error={errors.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            invalid={Boolean(errors.password)}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Button type="submit" block loading={loading}>
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>

        {DEV_LOGIN && mode === "signin" ? (
          <div className="mt-3 rounded-[10px] border border-dashed border-border-strong p-3">
            <p className="caption-text mb-2 text-text-muted">
              Development build. Signing in as{" "}
              <span className="font-medium text-text">{DEV_LOGIN.identifier}</span> with the
              seeded demo house.
            </p>
            <Button
              type="button"
              variant="secondary"
              block
              loading={loading}
              onClick={() => submit(DEV_LOGIN)}
            >
              Skip the login — open the demo house
            </Button>
          </div>
        ) : null}

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="caption-text text-text-subtle">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="outline" block onClick={onGoogle}>
          Continue with Google
        </Button>

        <p className="caption-text mt-4 text-center text-text-muted">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link className="text-primary" href="/signin">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link className="text-primary" href="/signup">
                Create an account
              </Link>
            </>
          )}
        </p>
      </form>
    </Card>
  );
}

type Availability = "idle" | "checking" | "free" | "taken" | "invalid";

/**
 * Debounced availability check, so the answer arrives while they still care.
 *
 * The result is stored against the name it describes, and "checking" is derived
 * from the two disagreeing. Deriving it beats setting state from inside the
 * effect, which would re-render twice on every keystroke.
 */
function useUsernameAvailability(username: string): Availability {
  const [checked, setChecked] = useState<{ name: string; state: Availability }>({
    name: "",
    state: "idle",
  });

  const candidate = username.trim();

  useEffect(() => {
    if (candidate.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/auth/username?u=${encodeURIComponent(candidate)}`,
        );
        const body = await response.json();
        if (cancelled) return;
        setChecked({
          name: candidate,
          state: body.available ? "free" : body.reason ? "invalid" : "taken",
        });
      } catch {
        if (!cancelled) setChecked({ name: candidate, state: "idle" });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate]);

  if (candidate.length === 0) return "idle";
  return checked.name === candidate ? checked.state : "checking";
}

function UsernameHint({
  state,
  username,
}: {
  state: Availability;
  username: string;
}) {
  if (state === "idle" || username.trim().length === 0) return null;

  const copy: Record<Exclude<Availability, "idle">, { text: string; tone: string }> = {
    checking: { text: "Checking…", tone: "text-text-muted" },
    free: { text: `${username} is free`, tone: "text-success" },
    taken: { text: `${username} is taken`, tone: "text-danger" },
    invalid: {
      text: "3 to 20 characters: start with a letter, then letters, numbers or _",
      tone: "text-danger",
    },
  };

  const { text, tone } = copy[state];
  return (
    <p className={`caption-text mt-1.5 ${tone}`} aria-live="polite">
      {text}
    </p>
  );
}
