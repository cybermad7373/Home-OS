/**
 * Food insights (IN-04).
 *
 * The five questions phase 15 says food must answer: home-cooked versus
 * outside, spend over time, most liked, recently eaten, most repeated.
 *
 * "Most liked" is drawn from the Home's stated preferences, not from meal
 * ratings — HouseOS has never asked anybody to score a dinner, and inventing a
 * rating out of who turned up would call a dish popular because it was cheap.
 * A dish is liked when people said so.
 *
 * Dishes are counted by their normalised name so "Dosa", "dosa" and "DOSA"
 * are one dish, which is the same key the food library merges on.
 */

import { bucketKeyOf, bucketsBetween } from "./buckets";
import type {
  BucketTotal,
  FoodInsightsInput,
  FoodInsightsOutput,
  MostLiked,
  MostRepeated,
  RecentMeal,
} from "./types";

const TOP_N = 5;

export function buildFoodInsights(input: FoodInsightsInput): FoodInsightsOutput {
  const { range, memberFilter } = input;

  const selected = input.meals.filter((meal) => {
    if (meal.date < range.from || meal.date > range.to) return false;
    // Filtering by a person means the meals that person actually ate, which is
    // the only reading of "my food" that a shared kitchen supports.
    if (memberFilter && !meal.participantMemberIds.includes(memberFilter)) return false;
    return true;
  });

  const bucketKeys = bucketsBetween(range.from, range.to, range.granularity);
  const spendByBucket = new Map(bucketKeys.map((key) => [key, 0]));

  let homeCookedPaise = 0;
  let outsidePaise = 0;
  let homeCookedMeals = 0;
  let outsideMeals = 0;

  const timesEaten = new Map<string, { name: string; times: number }>();

  for (const meal of selected) {
    const cost = Math.max(0, meal.costPaise);
    const key = bucketKeyOf(meal.date, range.granularity);
    if (spendByBucket.has(key)) spendByBucket.set(key, (spendByBucket.get(key) ?? 0) + cost);

    // Bought, ordered and other are all "somebody else cooked it". The house
    // cares about the cooking, not about which shop it came from.
    if (meal.source === "home_cooked") {
      homeCookedPaise += cost;
      homeCookedMeals += 1;
    } else {
      outsidePaise += cost;
      outsideMeals += 1;
    }

    const dish = timesEaten.get(meal.normalisedName) ?? { name: meal.name, times: 0 };
    dish.times += 1;
    timesEaten.set(meal.normalisedName, dish);
  }

  const buckets: BucketTotal[] = bucketKeys.map((key) => ({
    key,
    totalPaise: spendByBucket.get(key) ?? 0,
  }));

  const recent: RecentMeal[] = [...selected]
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
    .slice(0, TOP_N)
    .map((meal) => ({
      name: meal.name,
      date: meal.date,
      source: meal.source,
      costPaise: meal.costPaise,
    }));

  const mostRepeated: MostRepeated[] = [...timesEaten.values()]
    .filter((dish) => dish.times > 1)
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
    .slice(0, TOP_N)
    .map((dish) => ({ name: dish.name, times: dish.times }));

  return {
    range,
    buckets,
    homeCookedPaise,
    outsidePaise,
    homeCookedMeals,
    outsideMeals,
    totalPaise: homeCookedPaise + outsidePaise,
    mostLiked: mostLikedDishes(input, timesEaten),
    recent,
    mostRepeated,
  };
}

/**
 * Likes minus dislikes, most agreeable first.
 *
 * The subtraction matters: a dish half the Home loves and half cannot eat is
 * not a house favourite, and ranking it on likes alone is how a shared kitchen
 * ends up cooking the one thing somebody quietly avoids.
 *
 * Filtering by a person narrows this to that person's own opinions, which is
 * what "what does Priya like" should mean.
 */
function mostLikedDishes(
  input: FoodInsightsInput,
  timesEaten: Map<string, { name: string; times: number }>,
): MostLiked[] {
  const tally = new Map<string, { name: string; likes: number; dislikes: number }>();

  for (const opinion of input.opinions) {
    if (input.memberFilter && opinion.memberId !== input.memberFilter) continue;
    if (opinion.rating === "okay") continue;

    const dish = tally.get(opinion.normalisedName) ?? {
      name: opinion.name,
      likes: 0,
      dislikes: 0,
    };
    if (opinion.rating === "like") dish.likes += 1;
    else dish.dislikes += 1;
    tally.set(opinion.normalisedName, dish);
  }

  return [...tally.entries()]
    .map(([normalisedName, dish]) => ({
      name: dish.name,
      likes: dish.likes,
      dislikes: dish.dislikes,
      score: dish.likes - dish.dislikes,
      timesEaten: timesEaten.get(normalisedName)?.times ?? 0,
    }))
    .filter((dish) => dish.score > 0)
    .sort(
      (a, b) => b.score - a.score || b.timesEaten - a.timesEaten || a.name.localeCompare(b.name),
    )
    .slice(0, TOP_N);
}
