import { EmptyState } from "@/components/ui/empty-state";
import { List } from "@/components/layout/section";
import { LinkExpenseChip } from "./link-expense-chip";
import { formatDate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import type { MealView } from "@/lib/data/food";

const SOURCE_LABEL: Record<string, string> = {
  home_cooked: "Home Cooked",
  bought: "Bought",
  ordered: "Ordered",
  other: "Other",
};

/** Meal History (S-42/S-44) — the Home's food history, everyone's, in one list. */
export function MealList({ meals, currency }: { meals: MealView[]; currency: string }) {
  if (meals.length === 0) {
    return (
      <EmptyState
        title="No meals recorded yet"
        body="What did you eat? Recording food is never mandatory, but this is where it lives once you do."
      />
    );
  }

  return (
    <List>
      {meals.map((meal) => (
        <li key={meal.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-medium text-text">{meal.name}</p>
              <p className="caption-text text-text-muted">
                {formatDate(meal.mealDate)} · {SOURCE_LABEL[meal.source] ?? meal.source}
                {meal.participants.length > 0
                  ? ` · ${meal.participants.map((p) => p.displayName).join(", ")}`
                  : ""}
              </p>
            </div>
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
  );
}
