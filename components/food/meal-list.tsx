"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { List } from "@/components/layout/section";
import { LinkExpenseChip } from "./link-expense-chip";
import { MealDetailSheet } from "./meal-detail-sheet";
import { formatDate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import type { MealView } from "@/lib/data/food";

const SOURCE_LABEL: Record<string, string> = {
  home_cooked: "Home Cooked",
  bought: "Bought",
  ordered: "Ordered",
  other: "Other",
};

/**
 * Who ate, short enough to scan.
 *
 * The row used to join every participant's full display name with commas. In
 * the seeded family home that is seven names and a guest — two wrapped lines of
 * grey caption under every meal, so the list of what the home ate was mostly a
 * list of who lives in it, repeated five times. Two names and a count carry the
 * same fact in one line; the full list stays on the element's `title`, which is
 * where a reader who wants all seven can get them.
 */
function ate(participants: { displayName: string }[]): { short: string; full: string } | null {
  if (participants.length === 0) return null;
  const names = participants.map((participant) => participant.displayName);
  const full = names.join(", ");
  if (names.length <= 2) return { short: full, full };
  const first = names.slice(0, 2).map((name) => name.split(/\s+/)[0]);
  return { short: `${first.join(", ")} +${names.length - 2}`, full };
}

/** Meal History (S-42/S-44) — the Home's food history, everyone's, in one list. */
export function MealList({ meals, currency }: { meals: MealView[]; currency: string }) {
  const [openMeal, setOpenMeal] = useState<MealView | null>(null);

  if (meals.length === 0) {
    return (
      <EmptyState
        title="No meals recorded yet"
        body="What did you eat? Recording food is never mandatory, but this is where it lives once you do."
      />
    );
  }

  return (
    <>
    <List>
      {meals.map((meal) => (
        <li key={meal.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            {/*
              The whole left side opens the meal (S-45). Until this existed a
              recorded meal could never be looked at again — a mistyped amount
              or a wrong date was permanent, and the recipe instructions the
              schema has carried since migration 081 had nowhere to be read.
              The row's own expense chip stays outside the button, because it is
              a second action and nesting one inside the other would make the
              whole row ambiguous to a keyboard.
            */}
            <button
              type="button"
              onClick={() => setOpenMeal(meal)}
              className="tap-44 min-w-0 flex-1 rounded-[var(--radius-xs)] text-left"
              aria-label={`Open ${meal.name}`}
            >
              <p className="text-[15px] font-medium text-text">{meal.name}</p>
              <p className="caption-text truncate text-text-muted">
                {formatDate(meal.mealDate)} · {SOURCE_LABEL[meal.source] ?? meal.source}
                {(() => {
                  const who = ate(meal.participants);
                  return who ? <span title={who.full}> · {who.short}</span> : null;
                })()}
              </p>
            </button>
            <div className="flex items-center gap-2">
              {meal.totalCostPaise > 0 ? (
                <span className="tabular text-[15px]">
                  {formatMoney(meal.totalCostPaise, { currency })}
                </span>
              ) : null}
              <LinkExpenseChip mealId={meal.id} expenseId={meal.expenseId} currency={currency} />
            </div>
          </div>
        </li>
      ))}
    </List>

    <MealDetailSheet
      meal={openMeal}
      currency={currency}
      open={openMeal !== null}
      onClose={() => setOpenMeal(null)}
    />
    </>
  );
}
