"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import type { MemberView } from "@/lib/types/domain";
import type { MealPlanView } from "@/lib/data/food";

type Source = "home_cooked" | "bought" | "ordered" | "other";

const SOURCES: { value: Source; label: string }[] = [
  { value: "home_cooked", label: "Home Cooked" },
  { value: "bought", label: "Bought" },
  { value: "ordered", label: "Ordered" },
  { value: "other", label: "Other" },
];

/**
 * "Confirm as eaten" — docs/15-FOOD-SPEC.md section 11. The only moment a
 * plan becomes evidence: participants and cost, same as Add Meal, minus the
 * name and date (the plan already snapshotted those) and minus "save to
 * library" (a plan's food link, if any, was decided when it was placed).
 */
export function ConfirmPlanSheet({
  plan,
  onClose,
  members,
}: {
  plan: MealPlanView | null;
  onClose: () => void;
  members: MemberView[];
}) {
  const router = useRouter();
  const toast = useToast();

  const activeMembers = members.filter((m) => m.status === "active");

  const [participantIds, setParticipantIds] = useState<string[]>(activeMembers.map((m) => m.id));
  const [source, setSource] = useState<Source>("home_cooked");
  const [baseCost, setBaseCost] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleParticipant(memberId: string) {
    setParticipantIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  function reset() {
    setParticipantIds(activeMembers.map((m) => m.id));
    setSource("home_cooked");
    setBaseCost("0");
    setError(null);
  }

  async function onConfirm() {
    if (!plan) return;
    setSaving(true);
    setError(null);

    const response = await fetch(`/api/food/plans/${plan.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participants: participantIds.map((memberId) => ({ memberId })),
        source,
        baseCostPaise: Math.round((Number(baseCost) || 0) * 100),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(body?.error?.message ?? "That did not save");
      return;
    }

    toast(`${plan.name} confirmed as eaten.`, "success");
    reset();
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open={plan !== null} onClose={onClose} title={plan ? `Confirm: ${plan.name}` : "Confirm"}>
      {plan ? (
        <>
          <p className="caption-text mb-4 text-text-muted">Planned for {formatDate(plan.plannedDate)}</p>

          <div className="mb-4">
            <Label>Participants</Label>
            <div className="flex flex-wrap gap-2">
              {activeMembers.map((member) => {
                const selected = participantIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleParticipant(member.id)}
                    className={cn(
                      "touch-target rounded-full border px-3 py-1.5 text-[14px]",
                      selected
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-border bg-surface-2 text-text-muted",
                    )}
                  >
                    {member.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <Label>Source</Label>
            <div className="flex gap-2">
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSource(s.value)}
                  className={cn(
                    "touch-target flex-1 rounded-[var(--radius-sm)] border px-2 py-2 text-[13px]",
                    source === s.value
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border bg-surface-2 text-text-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Cost (optional)" htmlFor="confirm-cost">
            <Input id="confirm-cost" inputMode="decimal" value={baseCost} onChange={(e) => setBaseCost(e.target.value)} />
          </Field>

          {error ? <p className="caption-text mb-3 mt-3 text-danger">{error}</p> : null}

          <Button block onClick={onConfirm} loading={saving} className="mt-4">
            Confirm as eaten
          </Button>
        </>
      ) : null}
    </BottomSheet>
  );
}
