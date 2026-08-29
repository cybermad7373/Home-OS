"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/**
 * "Plan it" — docs/15-FOOD-SPEC.md section 11 (FD-20). Any suggestion or
 * library meal can be placed on a future date. An intention, not a record:
 * no cost, no participants, no preference signal until it is confirmed.
 */
export function PlanItButton({
  name,
  foodId,
  minDate,
}: {
  name: string;
  foodId?: string;
  minDate: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(minDate);
  const [saving, setSaving] = useState(false);

  async function plan() {
    setSaving(true);
    const response = await fetch("/api/food/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, plannedDate: date, foodId }),
    });
    setSaving(false);
    if (!response.ok) {
      toast("That did not save", "danger");
      return;
    }
    toast(`${name} planned for ${date}.`, "success");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Plan ${name}`}
        className="touch-target text-text-subtle hover:text-primary"
      >
        <CalendarPlus size={16} aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        aria-label={`Date to plan ${name}`}
        value={date}
        min={minDate}
        onChange={(e) => setDate(e.target.value)}
        className="h-8 w-[130px] text-[13px]"
      />
      <Button size="sm" onClick={plan} loading={saving}>
        Plan
      </Button>
    </div>
  );
}
