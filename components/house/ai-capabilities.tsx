"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SwitchRow } from "@/components/ui/switch";
import { List, Section } from "@/components/layout/section";
import { useToast } from "@/components/ui/toast";
import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  isCapabilityOn,
  type Capability,
} from "@/lib/domain/llm/capabilities";

/**
 * The six switches under the key — AI-02, docs/10-LLM-SPEC.md section 3.6a.
 *
 * A Home with a key still decides which of the six call sites may use it. A
 * switch that is off behaves **exactly** as if no key were configured, for that
 * feature alone: the screen shows its deterministic path, with no banner, no
 * upsell and no error. So a Home that wants the food ideas and not a model's
 * opinion on its rota can have exactly that.
 *
 * Each switch saves on its own. Batching them behind a Save button would make
 * the panel a form, and a form is a thing you can leave half-finished — which
 * for a spend control is the wrong failure.
 */
export function AiCapabilities({
  initial,
  disabled,
}: {
  initial: Record<string, boolean> | undefined;
  /** True when the Home has no key, in which case there is nothing to switch. */
  disabled: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      CAPABILITIES.map((capability) => [capability, isCapabilityOn(initial, capability)]),
    ),
  );
  const [busy, setBusy] = useState<Capability | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(capability: Capability, next: boolean) {
    const previous = state[capability];
    setState((current) => ({ ...current, [capability]: next }));
    setBusy(capability);
    setError(null);

    const response = await fetch("/api/ai/capabilities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [capability]: next }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);

    if (!response.ok) {
      // Put the switch back where it was. A control that stays where the person
      // left it after the save failed is a control that lies about the Home.
      setState((current) => ({ ...current, [capability]: previous }));
      setError(payload?.error?.message ?? "That did not save");
      return;
    }

    toast(next ? "On." : "Off. Nothing else changes.", "success");
  }

  return (
    <Section label="What the key may be used for">
      <p className="caption-text mb-3 text-text-muted">
        Each one has a version that works without a model. Turning one off takes
        away the prose, never the feature.
      </p>

      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <List>
        {CAPABILITIES.map((capability) => (
          <SwitchRow
            key={capability}
            label={CAPABILITY_LABEL[capability]}
            checked={state[capability]}
            disabled={disabled || busy !== null}
            onChange={(next) => void toggle(capability, next)}
          />
        ))}
      </List>

      {disabled ? (
        <p className="caption-text mt-3 text-text-muted">
          Add a key above and these become yours to set.
        </p>
      ) : null}
    </Section>
  );
}
