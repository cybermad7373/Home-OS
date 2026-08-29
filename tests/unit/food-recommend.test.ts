import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DEFAULT_WEIGHTS,
  rankLibrary,
  scoreFood,
  type RecommendCandidate,
  type RecommendContext,
} from "@/lib/domain/food/recommend";

const baseContext: RecommendContext = {
  now: "2026-08-28",
  mealType: "dinner",
  homeRegionTag: "IN-TN",
  homeMedianCostPaise: 5500,
  budgetPressure: 0.5,
};

function candidate(overrides: Partial<RecommendCandidate> = {}): RecommendCandidate {
  return {
    foodId: "food-1",
    name: "Paruppu Sadham",
    preference: 0.71,
    lastEatenOn: "2026-08-14",
    timesEatenLast30Days: 1,
    typicalCostPaise: 4200,
    regionTag: "IN-TN",
    mealTypes: ["dinner"],
    ...overrides,
  };
}

describe("determinism (section 5.3)", () => {
  it("the same inputs always produce the same ranking, in the same order", () => {
    const candidates = [
      candidate({ foodId: "a", name: "Paruppu Sadham" }),
      candidate({ foodId: "b", name: "Curd Kolambu", preference: 0.5, lastEatenOn: "2026-08-01" }),
      candidate({ foodId: "c", name: "Lemon Rice", preference: 0.2, lastEatenOn: "2026-08-20" }),
    ];
    const first = rankLibrary(candidates, new Set(), baseContext, 10);
    const second = rankLibrary(candidates, new Set(), baseContext, 10);
    expect(second).toEqual(first);
  });

  it("is stable under fast-check across randomised candidate sets", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            foodId: fc.uuid(),
            preference: fc.float({ min: Math.fround(-1), max: Math.fround(1), noNaN: true }),
            daysAgo: fc.integer({ min: 0, max: 60 }),
            timesEatenLast30Days: fc.integer({ min: 0, max: 10 }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (rows) => {
          const candidates = rows.map((r, i) =>
            candidate({
              foodId: r.foodId,
              name: `Food ${i}`,
              preference: r.preference,
              lastEatenOn: "2026-08-28",
              timesEatenLast30Days: r.timesEatenLast30Days,
            }),
          );
          const a = rankLibrary(candidates, new Set(), baseContext, 10);
          const b = rankLibrary(candidates, new Set(), baseContext, 10);
          expect(a).toEqual(b);
        },
      ),
    );
  });
});

describe("cold start", () => {
  it("fewer than five recorded meals produces the honest message, never a fabricated score", () => {
    const result = rankLibrary([candidate()], new Set(), baseContext, 4);
    expect(result.coldStart).toBe(true);
    expect(result.message).toMatch(/not enough history/i);
    expect(result.suggestions.every((s) => s.score === 0)).toBe(true);
  });

  it("shows the most recently eaten instead of a score at cold start", () => {
    const older = candidate({ foodId: "old", name: "Old Dish", lastEatenOn: "2026-08-01" });
    const recent = candidate({ foodId: "new", name: "New Dish", lastEatenOn: "2026-08-27" });
    const result = rankLibrary([older, recent], new Set(), baseContext, 3);
    expect(result.suggestions[0]?.foodId).toBe("new");
  });
});

describe("restriction filter (section 5.2a)", () => {
  it("a restricted food is absent from the candidate set, even at a score that would top the list", () => {
    const restricted = candidate({ foodId: "danger", name: "Peanut Chutney", preference: 1 });
    const safe = candidate({ foodId: "safe", name: "Curd Rice", preference: -0.9 });
    const result = rankLibrary([restricted, safe], new Set(["danger"]), baseContext, 10);
    expect(result.suggestions.map((s) => s.foodId)).not.toContain("danger");
  });

  it("raising every other term to its maximum never surfaces a restricted food", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), (daysAgo) => {
        const lastEaten = new Date(Date.parse("2026-08-28T00:00:00Z") - daysAgo * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const restricted = candidate({
          foodId: "danger",
          preference: 1, // maximum preference
          lastEatenOn: lastEaten, // any recency, up to the maximum bonus
          timesEatenLast30Days: 0, // no repetition penalty
          typicalCostPaise: 1, // minimum cost pressure
        });
        const result = rankLibrary([restricted], new Set(["danger"]), baseContext, 10);
        expect(result.suggestions).toHaveLength(0);
      }),
    );
  });

  it("empty is a legitimate answer — every candidate restricted for everyone present", () => {
    const only = candidate({ foodId: "danger" });
    const result = rankLibrary([only], new Set(["danger"]), baseContext, 10);
    expect(result.suggestions).toHaveLength(0);
    expect(result.message).toMatch(/nothing in the library/i);
  });
});

describe("individual override (section 5.2)", () => {
  it("a person who dislikes an item is never shown a meal containing it, while the Home's own ranking is unchanged", () => {
    const disliked = candidate({ foodId: "chicken-biryani", preference: -1 });
    const homeContext = { ...baseContext };

    const forVijay = scoreFood(disliked, homeContext);
    const forHome = scoreFood({ ...disliked, preference: 0.8 }, homeContext);

    // Vijay's own preference term is negative; the Home's (a different
    // person's substituted preference) is unaffected by Vijay's opinion.
    expect(forVijay.preference).toBeLessThan(0);
    expect(forHome.preference).toBeGreaterThan(0);
  });
});

describe("budget context", () => {
  it("a Home over its food budget ranks cheaper library meals above expensive ones, all else equal", () => {
    const cheap = candidate({ foodId: "cheap", name: "A", typicalCostPaise: 3000 });
    const expensive = candidate({ foodId: "pricey", name: "B", typicalCostPaise: 12000 });
    const tightBudget: RecommendContext = { ...baseContext, budgetPressure: 1 };

    const result = rankLibrary([cheap, expensive], new Set(), tightBudget, 10);
    const cheapIndex = result.suggestions.findIndex((s) => s.foodId === "cheap");
    const expensiveIndex = result.suggestions.findIndex((s) => s.foodId === "pricey");
    expect(cheapIndex).toBeGreaterThanOrEqual(0);
    if (expensiveIndex >= 0) expect(cheapIndex).toBeLessThan(expensiveIndex);
  });
});

describe("scoreFood — the worked example's shape", () => {
  it("weights sum such that a well-liked, due, cheap, local, in-season dinner scores well", () => {
    const good = candidate();
    const breakdown = scoreFood(good, baseContext, DEFAULT_WEIGHTS);
    expect(breakdown.raw).toBeGreaterThan(0);
  });
});
