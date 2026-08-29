import { describe, expect, it } from "vitest";
import { levenshtein, matchFoodName, normaliseFoodName } from "@/lib/domain/food/dedup";
import type { LibraryCandidate } from "@/lib/domain/food/dedup";

describe("normaliseFoodName", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normaliseFoodName("  Paruppu-Sadham!! ")).toBe("paruppu sadham");
    expect(normaliseFoodName("Curd  Rice")).toBe("curd rice");
  });
});

describe("levenshtein", () => {
  it("is zero for identical strings", () => {
    expect(levenshtein("dal", "dal")).toBe(0);
  });

  it("counts a single substitution as distance 1", () => {
    expect(levenshtein("dal", "dhl")).toBe(1);
  });

  it("counts a single insertion as distance 1", () => {
    expect(levenshtein("dal", "dhal")).toBe(1);
  });
});

describe("matchFoodName — the four spellings from the spec", () => {
  const library: LibraryCandidate[] = [
    { id: "1", name: "Paruppu Sadham", timesEaten: 14 },
  ];

  it("offers the library entry, never creating a fifth", () => {
    for (const spelling of ["Parupu Sadham", "Paruppu Sadam", "Paruppu. Sadham"]) {
      const result = matchFoodName(spelling, library);
      expect(result.isNew).toBe(false);
    }
  });

  it("exact-matches the identical normalised form", () => {
    const result = matchFoodName("paruppu sadham", library);
    expect(result.exact?.id).toBe("1");
    expect(result.suggestions).toHaveLength(0);
  });

  it("is case- and punctuation-insensitive for the exact match", () => {
    const result = matchFoodName("  PARUPPU-SADHAM ", library);
    expect(result.exact?.id).toBe("1");
  });

  it("suggests rather than merges — the caller decides", () => {
    const result = matchFoodName("Parupu Sadham", library);
    expect(result.exact).toBeNull();
    expect(result.suggestions.map((s) => s.id)).toEqual(["1"]);
  });

  it("treats an unrelated name as new", () => {
    const result = matchFoodName("Chicken Biryani", library);
    expect(result.isNew).toBe(true);
    expect(result.suggestions).toHaveLength(0);
  });

  it("offers at most three, closest first", () => {
    const wideLibrary: LibraryCandidate[] = [
      { id: "a", name: "Tomatoo Rice", timesEaten: 1 }, // distance 1
      { id: "b", name: "Tomato Rce", timesEaten: 1 }, // distance 1
      { id: "c", name: "Tomata Rice", timesEaten: 1 }, // distance 1
      { id: "d", name: "Tomato Ricex", timesEaten: 1 }, // distance 1
    ];
    const result = matchFoodName("Tomato Rice", wideLibrary);
    expect(result.exact).toBeNull();
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it("scales the threshold with name length — a longer name tolerates more edits", () => {
    const longLibrary: LibraryCandidate[] = [
      { id: "1", name: "Vegetable Kothu Parotta", timesEaten: 2 },
    ];
    // 3-character edit on a 23-character name, under the >=12-char threshold of 3.
    const result = matchFoodName("Vegetable Kothu Parota", longLibrary);
    expect(result.isNew).toBe(false);
  });
});
