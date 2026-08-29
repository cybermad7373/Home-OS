"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface ExpenseOption {
  id: string;
  description: string | null;
  amountPaise: number;
}

/**
 * "Link to an expense" — docs/15-FOOD-SPEC.md section 6 line 129 and FD-07.
 * Optional, both directions, never required: voiding or deleting either side
 * leaves the other intact.
 */
export function LinkExpenseChip({
  mealId,
  expenseId,
  currency,
}: {
  mealId: string;
  expenseId: string | null;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [picking, setPicking] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseOption[] | null>(null);
  const [pickedId, setPickedId] = useState("");
  const [busy, setBusy] = useState(false);

  function openPicker() {
    setPicking(true);
    if (expenses === null) {
      fetch("/api/expenses")
        .then((r) => r.json())
        .then((body) => setExpenses(body.expenses ?? []));
    }
  }

  async function link() {
    if (!pickedId) return;
    setBusy(true);
    const response = await fetch(`/api/food/meals/${mealId}/link-expense`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expenseId: pickedId }),
    });
    setBusy(false);
    if (!response.ok) {
      toast("That did not save", "danger");
      return;
    }
    setPicking(false);
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    const response = await fetch(`/api/food/meals/${mealId}/link-expense`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      toast("That did not save", "danger");
      return;
    }
    router.refresh();
  }

  if (expenseId) {
    return (
      <button
        type="button"
        onClick={unlink}
        disabled={busy}
        aria-label="Unlink expense"
        className="touch-target text-text-subtle hover:text-danger"
      >
        <Link2Off size={14} aria-hidden />
      </button>
    );
  }

  if (!picking) {
    return (
      <button
        type="button"
        onClick={openPicker}
        aria-label="Link to an expense"
        className="touch-target text-text-subtle hover:text-primary"
      >
        <Link2 size={14} aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        aria-label="Choose an expense"
        value={pickedId}
        onChange={(e) => setPickedId(e.target.value)}
        className="h-8 text-[13px]"
      >
        <option value="">Choose an expense</option>
        {(expenses ?? []).map((expense) => (
          <option key={expense.id} value={expense.id}>
            {expense.description ?? "Expense"} · {(expense.amountPaise / 100).toFixed(0)} {currency}
          </option>
        ))}
      </Select>
      <Button size="sm" loading={busy} disabled={!pickedId} onClick={link}>
        Link
      </Button>
    </div>
  );
}
