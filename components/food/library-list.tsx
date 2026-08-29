import { EmptyState } from "@/components/ui/empty-state";
import { RatingButtons } from "./rating-buttons";
import { PlanItButton } from "./plan-it-button";
import { formatDate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import type { FoodView } from "@/lib/data/food";

/** Food Library (S-45) — every distinct dish the Home has eaten, deduplicated. */
export function LibraryList({
  foods,
  currency,
  myRatings,
  homeLikes,
  today,
}: {
  foods: FoodView[];
  currency: string;
  myRatings?: Map<string, "like" | "okay" | "dislike">;
  homeLikes?: Map<string, { likes: number; total: number }>;
  today: string;
}) {
  if (foods.length === 0) {
    return (
      <EmptyState
        title="The library is empty"
        body="Save a meal to the library from Add Meal, and it starts filling in here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {foods.map((food) => (
        <li key={food.id} className="rounded-[14px] border border-border bg-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-medium text-text">{food.name}</p>
              <p className="caption-text text-text-muted">
                Eaten {food.timesEaten} time{food.timesEaten === 1 ? "" : "s"}
                {food.lastEatenOn ? ` · last on ${formatDate(food.lastEatenOn)}` : ""}
                {homeLikes?.get(food.id)
                  ? ` · Liked by ${homeLikes.get(food.id)!.likes} of ${homeLikes.get(food.id)!.total}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {food.typicalCostPaise !== null ? (
                <span className="caption-text text-text-muted">
                  ~{formatMoney(food.typicalCostPaise, { currency })}
                </span>
              ) : null}
              <div className="flex items-center gap-2">
                <RatingButtons foodId={food.id} current={myRatings?.get(food.id)} />
                <PlanItButton name={food.name} foodId={food.id} minDate={today} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
