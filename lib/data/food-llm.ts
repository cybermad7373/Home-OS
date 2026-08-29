import { route } from "@/lib/infra/llm/router";
import {
  FOOD_IDEAS_MAX_TOKENS,
  FOOD_IDEAS_RESPONSE_SCHEMA,
  FOOD_IDEAS_SYSTEM_PROMPT,
  FOOD_IDEAS_TEMPERATURE,
  validateIdeas,
  type FoodIdea,
  type FoodIdeasPayload,
  type RawFoodIdeasResponse,
} from "@/lib/domain/llm/food-ideas";
import { budgetPressureFor, listFoods, listFoodPreferences, listMyRestrictions } from "./food";
import { houseToday } from "@/lib/utils/date";
import type { Session } from "./house";

/**
 * Call site 5 — Food ideas. docs/10-LLM-SPEC.md section 9.
 *
 * Writes nothing (FD-17): this only ever returns two ideas or none. Returns
 * null exactly as the router does — no key, capability off, or the response
 * failed validation — and every caller reads null as "render the library half
 * alone", never as an error (section 9.5).
 */

interface House {
  id: string;
  city: string | null;
  state: string | null;
  country_code: string | null;
}

function seasonFor(now: string): string {
  const month = Number(now.slice(5, 7));
  if (month >= 6 && month <= 9) return "monsoon";
  if (month >= 3 && month <= 5) return "summer";
  return "winter";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function budgetStateFor(pressure: number): FoodIdeasPayload["budget_state"] {
  if (pressure >= 0.9) return "over";
  if (pressure >= 0.4) return "tight";
  return "comfortable";
}

export async function getFoodIdeas(
  session: Session,
  house: House,
  memberId: string,
  mealType: string,
): Promise<FoodIdea[] | null> {
  try {
    return await getFoodIdeasUnsafe(session, house, memberId, mealType);
  } catch {
    // Section 9.5: no error is shown anywhere. A failed call drops the AI
    // half; the library half renders alone, which is the correct outcome.
    return null;
  }
}

async function getFoodIdeasUnsafe(
  session: Session,
  house: House,
  memberId: string,
  mealType: string,
): Promise<FoodIdea[] | null> {
  const provider = await route(house.id, "food_ideas");
  if (!provider) return null;

  const [foods, myPreferences, myRestrictions] = await Promise.all([
    listFoods(session, house.id),
    listFoodPreferences(session, house.id).then((rows) => rows.filter((r) => r.memberId === memberId)),
    listMyRestrictions(session, memberId),
  ]);

  const now = houseToday();
  const budgetPressure = await budgetPressureFor(session, house.id);

  const recentMeals = foods
    .filter((f) => f.lastEatenOn !== null)
    .sort((a, b) => (b.lastEatenOn! < a.lastEatenOn! ? -1 : 1))
    .slice(0, 5)
    .map((f) => ({
      name: f.name,
      days_ago: Math.max(
        0,
        Math.round((Date.parse(`${now}T00:00:00Z`) - Date.parse(`${f.lastEatenOn}T00:00:00Z`)) / 86_400_000),
      ),
    }));

  const payload: FoodIdeasPayload = {
    location: { city: house.city, state: house.state, country: house.country_code },
    meal_type: mealType,
    season: seasonFor(now),
    popular_meals: [...foods]
      .sort((a, b) => b.timesEaten - a.timesEaten)
      .slice(0, 8)
      .map((f) => f.name),
    liked_items: myPreferences.filter((p) => p.itemName && p.rating === "like").map((p) => p.itemName!),
    disliked_items: myPreferences.filter((p) => p.itemName && p.rating === "dislike").map((p) => p.itemName!),
    excluded_items: myRestrictions.map((r) => r.itemName),
    recent_meals: recentMeals,
    budget_state: budgetStateFor(budgetPressure),
    outside_food_frequency: "medium",
    typical_per_person_paise: median(foods.map((f) => f.typicalCostPaise).filter((c): c is number => c !== null)),
  };

  const result = await provider.complete<RawFoodIdeasResponse>({
    purpose: "food_ideas",
    system: FOOD_IDEAS_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
    schema: FOOD_IDEAS_RESPONSE_SCHEMA,
    maxTokens: FOOD_IDEAS_MAX_TOKENS,
    temperature: FOOD_IDEAS_TEMPERATURE,
  });

  if (!result.ok || !result.data) return null;

  return validateIdeas({
    ideas: result.data.ideas,
    libraryNames: foods.map((f) => f.name),
    dislikedItems: payload.disliked_items,
    excludedItems: payload.excluded_items,
  });
}
