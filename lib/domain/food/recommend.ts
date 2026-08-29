/**
 * The library recommendation — deterministic, always available.
 * docs/15-FOOD-SPEC.md sections 6.1 and 5.2a.
 *
 * Pure: no database, no framework, no clock read internally — `now` and every
 * other fact about the world arrives as an argument, which is what makes "the
 * same inputs always produce the same ranking" (section 5.3) a property this
 * module can actually guarantee rather than merely intend.
 *
 * The restriction filter (section 5.2a) runs first and is never a term in the
 * score: it removes a candidate from the set before any weight touches it, so
 * no combination of weights can put a restricted food back in.
 */

export interface RecommendCandidate {
  foodId: string;
  name: string;
  /** −1…+1. Person's own rating where they have one; otherwise the caller
   *  should have already substituted the Home's. Null means genuinely unrated
   *  by anyone — treated as neutral (0). */
  preference: number | null;
  /** ISO date. Every candidate in section 6.1 has been eaten at least once. */
  lastEatenOn: string;
  /** Times this food was eaten in the 30 days up to `now`. */
  timesEatenLast30Days: number;
  /** Paise. Null when the food has no recorded cost history yet. */
  typicalCostPaise: number | null;
  regionTag: string | null;
  mealTypes: string[];
}

export interface RecommendContext {
  now: string; // ISO date, house-timezone "today"
  mealType: string;
  homeRegionTag: string | null;
  homeMedianCostPaise: number | null;
  /** 0…1. How pressed the Home's food budget is this month; 0 is comfortable. */
  budgetPressure: number;
}

export interface ScoreWeights {
  preference: number;
  recency: number;
  repetition: number;
  cost: number;
  local: number;
  mealType: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  preference: 0.35,
  recency: 0.2,
  repetition: 0.15,
  cost: 0.15,
  local: 0.1,
  mealType: 0.05,
};

export interface ScoredFood {
  foodId: string;
  name: string;
  /** 0…100, for display. */
  score: number;
  reasons: string[];
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** 0 for eaten today, rising to 1 at 21 days and flat after. */
function recencyBonus(lastEatenOn: string, now: string): number {
  const days = daysBetween(lastEatenOn, now);
  return Math.min(1, days / 21);
}

/** Scaled so once-in-30-days reads 0.10 — the only number the spec commits to. */
function repetitionPenalty(timesEatenLast30Days: number): number {
  return Math.min(1, timesEatenLast30Days / 10);
}

function costPressure(
  typicalCostPaise: number | null,
  homeMedianCostPaise: number | null,
  budgetPressure: number,
): number {
  if (typicalCostPaise === null || homeMedianCostPaise === null || homeMedianCostPaise <= 0) {
    return 0;
  }
  const aboveMedian = Math.max(0, (typicalCostPaise - homeMedianCostPaise) / homeMedianCostPaise);
  return Math.min(1, budgetPressure * aboveMedian);
}

function localRelevance(regionTag: string | null, homeRegionTag: string | null): number {
  if (!regionTag) return 0.5;
  if (!homeRegionTag) return 0.5;
  return regionTag === homeRegionTag ? 1 : 0;
}

function mealTypeFit(mealTypes: string[], mealType: string): number {
  if (mealTypes.length === 0) return 0.5;
  return mealTypes.includes(mealType) ? 1 : 0;
}

// Theoretical bounds of the weighted sum, used only to map the raw score onto
// a 0-100 display range. Not a claim about what any particular meal scores.
function bounds(weights: ScoreWeights): { min: number; max: number } {
  const max =
    weights.preference * 1 + weights.recency * 1 + weights.local * 1 + weights.mealType * 1;
  const min = -weights.preference * 1 - weights.repetition * 1 - weights.cost * 1;
  return { min, max };
}

export interface ScoreBreakdown {
  raw: number;
  preference: number;
  recency: number;
  repetition: number;
  cost: number;
  local: number;
  mealType: number;
}

export function scoreFood(
  candidate: RecommendCandidate,
  context: RecommendContext,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ScoreBreakdown {
  const preference = candidate.preference ?? 0;
  const recency = recencyBonus(candidate.lastEatenOn, context.now);
  const repetition = repetitionPenalty(candidate.timesEatenLast30Days);
  const cost = costPressure(
    candidate.typicalCostPaise,
    context.homeMedianCostPaise,
    context.budgetPressure,
  );
  const local = localRelevance(candidate.regionTag, context.homeRegionTag);
  const type = mealTypeFit(candidate.mealTypes, context.mealType);

  const raw =
    weights.preference * preference +
    weights.recency * recency -
    weights.repetition * repetition -
    weights.cost * cost +
    weights.local * local +
    weights.mealType * type;

  return { raw, preference, recency, repetition, cost, local, mealType: type };
}

function reasonsFor(candidate: RecommendCandidate, breakdown: ScoreBreakdown, now: string): string[] {
  const reasons: string[] = [];
  const days = daysBetween(candidate.lastEatenOn, now);
  reasons.push(days === 0 ? "Eaten today" : `Last eaten ${days} day${days === 1 ? "" : "s"} ago`);
  if (breakdown.preference > 0.2) reasons.push("Liked by the Home");
  else if (breakdown.preference < -0.2) reasons.push("Mixed opinions");
  if (candidate.typicalCostPaise !== null) {
    reasons.push(`₹${(candidate.typicalCostPaise / 100).toFixed(0)}/person`);
  }
  if (breakdown.repetition < 0.15) reasons.push("Low repetition this month");
  return reasons;
}

export interface RankResult {
  suggestions: ScoredFood[];
  /** Set when the library half has nothing to show and says why (section 6.1). */
  message: string | null;
  /** True when the message is the cold-start message rather than "everything is restricted". */
  coldStart: boolean;
}

/**
 * Ranks the Home's library for one person at one moment. `restrictedFoodIds`
 * has already been computed from `foods_safe_for` (082) — this function only
 * removes them, it never reads a restriction directly (section 5.2a rule 5:
 * restrictions never travel through a Home-wide surface).
 */
export function rankLibrary(
  candidates: RecommendCandidate[],
  restrictedFoodIds: ReadonlySet<string>,
  context: RecommendContext,
  totalRecordedMeals: number,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): RankResult {
  const safe = candidates.filter((c) => !restrictedFoodIds.has(c.foodId));

  if (totalRecordedMeals < 5) {
    const mostRecent = [...safe]
      .sort((a, b) => (a.lastEatenOn < b.lastEatenOn ? 1 : a.lastEatenOn > b.lastEatenOn ? -1 : a.name.localeCompare(b.name)))
      .slice(0, 2)
      .map((c) => ({ foodId: c.foodId, name: c.name, score: 0, reasons: ["Recently eaten"] }));
    return {
      suggestions: mostRecent,
      message: "Not enough history yet — record a few meals and this fills in",
      coldStart: true,
    };
  }

  if (safe.length === 0) {
    return {
      suggestions: [],
      message: "Nothing in the library is safe for everyone eating tonight",
      coldStart: false,
    };
  }

  const { min, max } = bounds(weights);
  const scored = safe
    .map((candidate) => {
      const breakdown = scoreFood(candidate, context, weights);
      const normalised = Math.round(
        Math.max(0, Math.min(1, (breakdown.raw - min) / (max - min))) * 100,
      );
      return {
        foodId: candidate.foodId,
        name: candidate.name,
        score: normalised,
        reasons: reasonsFor(candidate, breakdown, context.now),
        _raw: breakdown.raw,
      };
    })
    .sort((a, b) => b._raw - a._raw || a.name.localeCompare(b.name))
    .slice(0, 2)
    .map((s) => ({ foodId: s.foodId, name: s.name, score: s.score, reasons: s.reasons }));

  return { suggestions: scored, message: null, coldStart: false };
}
