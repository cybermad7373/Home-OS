"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A rejection needs a reason of at least ten characters (AP-06), asked for the
 * same way everywhere: four presets, or type one.
 *
 * The presets are not there to save typing. A rejection with no reason is a
 * decision nobody can act on, and "no" is the reason people give when the box
 * is empty and they are in a hurry.
 */
const PRESETS = [
  "The amount does not look right to me.",
  "This is not something the house agreed to.",
  "Let us talk about this before it happens.",
  "This is not the right time for it.",
];

export const MIN_REASON = 10;

export function RejectForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < MIN_REASON;

  return (
    <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-2 p-3">
      <p className="caption-text mb-2 text-text-muted">Why are you rejecting it?</p>

      <ul className="mb-2 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <li key={preset}>
            <button
              type="button"
              onClick={() => setReason(preset)}
              className="rounded-full border border-border px-3 py-1 text-[12px] text-text-muted hover:border-primary hover:text-text"
            >
              {preset}
            </button>
          </li>
        ))}
      </ul>

      <Input
        aria-label="Reason for rejecting"
        value={reason}
        placeholder="Say why, in a sentence somebody could act on"
        onChange={(event) => setReason(event.target.value)}
      />

      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant="danger"
          loading={busy}
          disabled={tooShort}
          onClick={() => onSubmit(reason.trim())}
        >
          Reject
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {tooShort ? (
          <span className="caption-text text-text-muted">
            {MIN_REASON - reason.trim().length} more characters
          </span>
        ) : null}
      </div>
    </div>
  );
}
