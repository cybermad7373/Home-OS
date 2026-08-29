/**
 * Shopping list generation — pure, no database and no framework.
 *
 * docs/15-FOOD-SPEC.md section 13. A plan's ingredients come from its linked
 * library food's `default_items`; a plan with no linked food contributes
 * nothing (there is no ingredient list to read). `shopping_items.meal_id`
 * points at a *meal* (an eaten record), and a plan is not one yet, so a
 * generated item carries no meal link until someone confirms the plan and
 * links it by hand. Generation never duplicates an item already on the list,
 * matched the same normalised way food names are (lib/domain/food/dedup.ts),
 * so pressing "Generate" twice is a no-op the second time.
 */

import { normaliseFoodName } from "./dedup";

export interface PlanForShopping {
  foodId: string | null;
  defaultItems: string[];
}

/**
 * One name per ingredient not already present (by normalised name) on the
 * existing list. When the same ingredient is named by two different plans in
 * the window, only the first produces a draft — the second is a duplicate of
 * what generation itself just proposed, not only of what already existed.
 */
export function buildShoppingDrafts(
  plans: PlanForShopping[],
  existingItemNames: string[],
): string[] {
  const seen = new Set(existingItemNames.map(normaliseFoodName));
  const drafts: string[] = [];

  for (const plan of plans) {
    if (!plan.foodId) continue;
    for (const item of plan.defaultItems) {
      const normalised = normaliseFoodName(item);
      if (normalised.length === 0 || seen.has(normalised)) continue;
      seen.add(normalised);
      drafts.push(item);
    }
  }

  return drafts;
}
