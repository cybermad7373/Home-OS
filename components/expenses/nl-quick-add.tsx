"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/**
 * Call site 3 — natural-language entry. docs/10-LLM-SPEC.md section 7.
 *
 * "paid 840 for vegetables yesterday" becomes a filled-in form, not a saved
 * record. Nothing here writes without a tap: an expense opens the ordinary
 * sheet with the fields set, and a chore shows a confirm button naming the
 * chore it matched.
 *
 * Below 0.70 confidence the form opens empty with the model's own clarifying
 * question as help text, which is the honest outcome of a guess nobody should
 * act on.
 */

export interface ExpensePrefill {
  amount: string;
  category: string;
  expense_date: string;
  description: string;
  /** Set when the fields were only a good guess — spec's amber note. */
  warn?: boolean;
}

interface ParseResult {
  intent: "expense" | "chore_done" | "unknown";
  confidence: number;
  presentation: "prefilled" | "prefilled_warn" | "empty";
  proposal:
    | { amount: string; category: string; expense_date: string; description: string }
    | { assignment_id: string; chore: string }
    | null;
  clarification: string | null;
  adjustments: string[];
}

export function NlQuickAdd({
  onExpense,
  placeholder = "paid 840 for vegetables yesterday",
}: {
  onExpense: (prefill: ExpensePrefill) => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [chore, setChore] = useState<{ assignmentId: string; chore: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim().length < 2) return;

    setBusy(true);
    setNote(null);
    setChore(null);

    const response = await fetch("/api/ai/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setNote(body?.error?.message ?? "Couldn't read that one.");
      return;
    }

    const result = body as ParseResult;

    if (result.intent === "expense" && result.proposal && "amount" in result.proposal) {
      onExpense({ ...result.proposal, warn: result.presentation === "prefilled_warn" });
      setText("");
      return;
    }

    if (result.intent === "chore_done" && result.proposal && "assignment_id" in result.proposal) {
      setChore({
        assignmentId: result.proposal.assignment_id,
        chore: result.proposal.chore,
      });
      return;
    }

    setNote(result.clarification ?? "Not sure what that was — use the form below.");
  }

  async function markDone() {
    if (!chore) return;
    setBusy(true);
    const response = await fetch(`/api/chores/${chore.assignmentId}/done`, { method: "POST" });
    setBusy(false);
    setChore(null);
    setText("");

    if (!response.ok) {
      setNote("That chore couldn't be marked done. Open it on your list.");
      return;
    }

    toast(`${chore.chore} marked done`, "success");
    router.refresh();
  }

  return (
    <div className="mb-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          aria-label="Say what you spent or did"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
        />
        <Button type="submit" loading={busy} disabled={text.trim().length < 2}>
          Read
        </Button>
      </form>

      {chore ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2">
          <span className="caption-text">Mark &ldquo;{chore.chore}&rdquo; done?</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setChore(null)}>
              No
            </Button>
            <Button size="sm" loading={busy} onClick={markDone}>
              Yes
            </Button>
          </div>
        </div>
      ) : null}

      {note ? (
        <div className="mt-2">
          <Alert tone="info">{note}</Alert>
        </div>
      ) : null}
    </div>
  );
}
