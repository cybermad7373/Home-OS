"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import type { MemberView } from "@/lib/types/domain";

type Source = "home_cooked" | "bought" | "ordered" | "other";

const SOURCES: { value: Source; label: string }[] = [
  { value: "home_cooked", label: "Home Cooked" },
  { value: "bought", label: "Bought" },
  { value: "ordered", label: "Ordered" },
  { value: "other", label: "Other" },
];

interface MatchCandidate {
  id: string;
  name: string;
  timesEaten: number;
}

/**
 * Add Meal — docs/15-FOOD-SPEC.md section 8.1, in the order of importance it
 * specifies: name, participants, source, cost, everything else below the
 * fold. A meal with only a name and today's date is a valid meal — nothing
 * below the fourth field is required.
 */
export function AddMealSheet({
  open,
  onClose,
  members,
  today,
}: {
  open: boolean;
  onClose: () => void;
  members: MemberView[];
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members],
  );

  const [name, setName] = useState("");
  const [foodId, setFoodId] = useState<string | null>(null);
  const [match, setMatch] = useState<{ exact: MatchCandidate | null; suggestions: MatchCandidate[] } | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>(activeMembers.map((m) => m.id));
  const [source, setSource] = useState<Source>("home_cooked");
  const [mealDate, setMealDate] = useState(today);
  const [costExpanded, setCostExpanded] = useState(false);
  const [baseCost, setBaseCost] = useState("0");
  const [prepCost, setPrepCost] = useState("0");
  const [deliveryCost, setDeliveryCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mealType, setMealType] = useState("other");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resets the participant selection to "everyone active" each time the sheet
  // opens. Derived during render rather than in an effect — React's own
  // answer to "reset state when a prop changes" — so it takes one render
  // instead of two.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setParticipantIds(activeMembers.map((m) => m.id));
  }

  useEffect(() => {
    if (!name.trim() || foodId) {
      const clear = setTimeout(() => setMatch(null), 0);
      return () => clearTimeout(clear);
    }
    const timeout = setTimeout(async () => {
      const response = await fetch("/api/food/library/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) return;
      const body = await response.json();
      setMatch(body);
    }, 350);
    return () => clearTimeout(timeout);
  }, [name, foodId]);

  function toggleParticipant(memberId: string) {
    setParticipantIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  function reset() {
    setName("");
    setFoodId(null);
    setMatch(null);
    setParticipantIds(activeMembers.map((m) => m.id));
    setSource("home_cooked");
    setMealDate(today);
    setCostExpanded(false);
    setBaseCost("0");
    setPrepCost("0");
    setDeliveryCost("0");
    setOtherCost("0");
    setSaveToLibrary(true);
    setMoreOpen(false);
    setMealType("other");
    setNote("");
    setError(null);
  }

  async function onSave() {
    if (!name.trim()) {
      setError("Name it");
      return;
    }
    setSaving(true);
    setError(null);

    const toPaise = (rupees: string) => Math.round((Number(rupees) || 0) * 100);

    const response = await fetch("/api/food/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mealDate,
        source,
        mealType,
        baseCostPaise: toPaise(baseCost),
        prepCostPaise: toPaise(prepCost),
        deliveryCostPaise: toPaise(deliveryCost),
        otherCostPaise: toPaise(otherCost),
        participants: participantIds.map((memberId) => ({ memberId })),
        foodId: foodId ?? undefined,
        saveToLibrary,
        note: note.trim() || undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(
        body?.error?.details?.fields
          ? (Object.values(body.error.details.fields)[0] as string)
          : (body?.error?.message ?? "That did not save"),
      );
      return;
    }

    toast(`${name} added to today's food history.`, "success");
    reset();
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add Meal">
      <Field label="Name" htmlFor="meal-name">
        <Input
          id="meal-name"
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFoodId(null);
          }}
          placeholder="What did you eat?"
        />
        {match && !match.exact && match.suggestions.length > 0 ? (
          <div className="mt-2 rounded-[10px] border border-border bg-surface-2 p-2">
            <p className="caption-text mb-1 text-text-muted">Did you mean:</p>
            {match.suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setName(s.name);
                  setFoodId(s.id);
                  setMatch(null);
                }}
                className="block w-full rounded-[8px] px-2 py-1.5 text-left text-[14px] hover:bg-surface"
              >
                {s.name} <span className="text-text-subtle">({s.timesEaten} eaten)</span>
              </button>
            ))}
          </div>
        ) : null}
        {match?.exact ? (
          <p className="caption-text mt-1 text-text-muted">
            Matched to your library: {match.exact.name}
          </p>
        ) : null}
      </Field>

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
                "touch-target flex-1 rounded-[10px] border px-2 py-2 text-[13px]",
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

      <div className="mb-4">
        <Label>Cost</Label>
        {!costExpanded ? (
          <button
            type="button"
            onClick={() => setCostExpanded(true)}
            className="flex h-11 w-full items-center rounded-[10px] border border-border bg-surface-2 px-3 text-[15px] text-text-muted"
          >
            {baseCost === "0" ? "Tap to enter a cost (optional)" : `₹${baseCost}`}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Base" htmlFor="cost-base">
              <Input id="cost-base" inputMode="decimal" value={baseCost} onChange={(e) => setBaseCost(e.target.value)} />
            </Field>
            <Field label="Prep" htmlFor="cost-prep">
              <Input id="cost-prep" inputMode="decimal" value={prepCost} onChange={(e) => setPrepCost(e.target.value)} />
            </Field>
            <Field label="Delivery" htmlFor="cost-delivery">
              <Input id="cost-delivery" inputMode="decimal" value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} />
            </Field>
            <Field label="Other" htmlFor="cost-other">
              <Input id="cost-other" inputMode="decimal" value={otherCost} onChange={(e) => setOtherCost(e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      {!moreOpen ? (
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="caption-text mb-4 text-primary"
        >
          More options
        </button>
      ) : (
        <div className="mb-4 flex flex-col gap-3">
          <Field label="Date" htmlFor="meal-date">
            <Input id="meal-date" type="date" value={mealDate} onChange={(e) => setMealDate(e.target.value)} />
          </Field>
          <Field label="Meal type" htmlFor="meal-type">
            <Select id="meal-type" value={mealType} onChange={(e) => setMealType(e.target.value)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Note" htmlFor="meal-note">
            <Input id="meal-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-[14px] text-text">
            <input
              type="checkbox"
              checked={saveToLibrary}
              onChange={(e) => setSaveToLibrary(e.target.checked)}
            />
            Save to Home Food Library
          </label>
        </div>
      )}

      {error ? <p className="caption-text mb-3 text-danger">{error}</p> : null}

      <Button block onClick={onSave} loading={saving}>
        Save
      </Button>
    </BottomSheet>
  );
}
