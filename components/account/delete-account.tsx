"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/infra/supabase/client";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

/**
 * The delete-my-account control.
 *
 * Two things make this different from every other destructive button in the
 * app, and both are deliberate.
 *
 * **It says what survives, before it asks.** "This cannot be undone" is what a
 * confirmation says when nobody has thought about what it does. What a person
 * needs to know here is that the expenses they paid stay in the ledger under
 * "Former member" — because if they are deleting the account to get those
 * removed, this is not the button for that, and finding out afterwards is
 * finding out too late.
 *
 * **The confirmation is their own username, typed.** A second Are-you-sure is
 * a click away from the first; typing eight characters is not something a
 * thumb does by accident on a phone.
 */
export function DeleteAccount({
  canErase,
  blockers,
  username,
}: {
  canErase: boolean;
  blockers: { id: string; name: string }[];
  username: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === username.trim().toLowerCase();

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        setError(apiErrorMessage(await response.json().catch(() => null), "That did not work."));
        setBusy(false);
        return;
      }
      // Signed out from this device as well: the account is already closed on
      // the server, and a stale session showing an anonymised profile is a
      // worse goodbye than the sign-in screen.
      await createClient().auth.signOut();
      router.push("/signin?deleted=1");
      router.refresh();
    } catch {
      setError("That did not work.");
      setBusy(false);
    }
  }

  if (!canErase) {
    return (
      <Alert tone="warning" title="Leave your Homes first">
        <p>
          Leaving a Home is a decision that Home makes, so it cannot happen from
          here. Ask to be removed in{" "}
          {blockers.map((home, index) => (
            <span key={home.id}>
              {index > 0 ? ", " : ""}
              <strong>{home.name}</strong>
            </span>
          ))}
          , and delete your account once that is done.
        </p>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label={`Type your username to confirm`}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={username}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={busy}
      />

      {/* Beside the button that produced it, which is the whole of D-84. */}
      {error ? (
        <Alert tone="danger" title="Not deleted">
          <p>{error}</p>
        </Alert>
      ) : null}

      <Button
        variant="danger"
        onClick={erase}
        disabled={!matches || busy}
        aria-disabled={!matches || busy}
      >
        {busy ? "Deleting…" : "Delete my account"}
      </Button>
    </div>
  );
}
