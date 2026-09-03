"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils/date";
import { ConfirmPlanSheet } from "./confirm-plan-sheet";
import type { MemberView } from "@/lib/types/domain";
import type { MealPlanView } from "@/lib/data/food";

/**
 * Planned meals (section 11, FD-20) on the Food page — the Calendar day view
 * (S-52) is Phase 14. An intention, marked as such, never counted as history
 * until it is confirmed.
 */
export function PlannedMeals({ plans, members }: { plans: MealPlanView[]; members: MemberView[] }) {
  const router = useRouter();
  const toast = useToast();

  const [confirming, setConfirming] = useState<MealPlanView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const upcoming = plans.filter((p) => !p.confirmedMealId);

  async function cancel(plan: MealPlanView) {
    setBusyId(plan.id);
    const response = await fetch(`/api/food/plans/${plan.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!response.ok) {
      toast("That did not save", "danger");
      return;
    }
    router.refresh();
  }

  if (upcoming.length === 0) {
    return (
      <EmptyState
        title="Nothing planned"
        body="Plan it from a suggestion or the library, and it shows up here until you confirm it as eaten."
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {upcoming.map((plan) => (
          <li
            key={plan.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-3"
          >
            <div>
              <p className="text-[15px] text-text">{plan.name}</p>
              <p className="caption-text text-text-muted">Planned for {formatDate(plan.plannedDate)}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirming(plan)}
                disabled={busyId === plan.id}
                aria-label={`Confirm ${plan.name} as eaten`}
                className="touch-target flex items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <Check size={18} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => cancel(plan)}
                disabled={busyId === plan.id}
                aria-label={`Cancel plan for ${plan.name}`}
                className="touch-target flex items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-surface-2 hover:text-text"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmPlanSheet plan={confirming} onClose={() => setConfirming(null)} members={members} />
    </>
  );
}
