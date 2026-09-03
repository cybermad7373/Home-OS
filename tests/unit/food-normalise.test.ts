import { describe, expect, it } from "vitest";
import {
  FOOD_NORMALISE_MAX_CANDIDATES,
  FOOD_NORMALISE_MIN_CONFIDENCE,
  FOOD_NORMALISE_RESPONSE_SCHEMA,
  candidatesFor,
  payloadFor,
  validateNormalisation,
  type NormaliseCandidate,
} from "@/lib/domain/llm/food-normalise";

/**
 * Call site 6 — food normalisation (FD-10).
 *
 * The prompt asks the model to choose from a list. Nothing here trusts that it
 * did: every property the feature is safe because of is enforced on our side of
 * the call, and these are the cases that prove it. The stake is stated in the
 * spec — a wrongly merged food cannot be unpicked, and a duplicate can — so
 * every ambiguous answer has to resolve to "no match".
 */

const library: NormaliseCandidate[] = [
  { id: "a", name: "Paruppu Sadham", timesEaten: 12 },
  { id: "b", name: "Tomato Rice", timesEaten: 9 },
  { id: "c", name: "Chicken Biryani", timesEaten: 4 },
];

describe("validateNormalisation only ever returns something the home already has", () => {
  it("resolves a transliteration edit distance cannot reach", () => {
    // The spec's own example: seven edits from "Paruppu Sadham", same dish.
    const result = validateNormalisation({
      response: { match: 1, confidence: 0.9 },
      typedName: "Parupu Rice",
      candidates: library,
    });

    expect(result).toEqual(library[0]);
  });

  it("treats the documented zero as no match", () => {
    expect(
      validateNormalisation({
        response: { match: 0 },
        typedName: "Idli",
        candidates: library,
      }),
    ).toBeNull();
  });

  it("drops an index past the end of the list it was sent", () => {
    expect(
      validateNormalisation({
        response: { match: 4, confidence: 1 },
        typedName: "Idli",
        candidates: library,
      }),
    ).toBeNull();
  });

  it("drops a negative or fractional index", () => {
    for (const match of [-1, 1.5]) {
      expect(
        validateNormalisation({
          response: { match, confidence: 1 },
          typedName: "Idli",
          candidates: library,
        }),
      ).toBeNull();
    }
  });

  it("drops a null or absent match", () => {
    expect(
      validateNormalisation({
        response: { match: null },
        typedName: "Idli",
        candidates: library,
      }),
    ).toBeNull();
  });

  it("refuses an answer the model itself was unsure of", () => {
    expect(
      validateNormalisation({
        response: { match: 1, confidence: FOOD_NORMALISE_MIN_CONFIDENCE - 0.01 },
        typedName: "Parupu Rice",
        candidates: library,
      }),
    ).toBeNull();
  });

  it("accepts an answer exactly at the bar, and one that volunteered no confidence", () => {
    expect(
      validateNormalisation({
        response: { match: 2, confidence: FOOD_NORMALISE_MIN_CONFIDENCE },
        typedName: "Thakkali Sadam",
        candidates: library,
      }),
    ).toEqual(library[1]);

    expect(
      validateNormalisation({
        response: { match: 2 },
        typedName: "Thakkali Sadam",
        candidates: library,
      }),
    ).toEqual(library[1]);
  });

  it("refuses a match that is just the typed name back", () => {
    // Not a transliteration — it is the deterministic exact match, which
    // already ran and did not fire. Believing it here would let the model
    // re-decide a question the database had answered.
    expect(
      validateNormalisation({
        response: { match: 2, confidence: 1 },
        typedName: "  tomato   rice ",
        candidates: library,
      }),
    ).toBeNull();
  });

  it("cannot return a food that was not in the candidate list", () => {
    // The only route out of this function is an element of `candidates`, so an
    // invented dish has nowhere to arrive. Asserted by construction: every
    // index either lands on a candidate or returns null.
    for (let match = -3; match <= 10; match += 1) {
      const result = validateNormalisation({
        response: { match, confidence: 1 },
        typedName: "Something else entirely",
        candidates: library,
      });
      expect(result === null || library.includes(result)).toBe(true);
    }
  });
});

describe("candidatesFor sends the home's actual cooking, and a bounded amount of it", () => {
  it("orders by how often the home eats it, ties broken by name", () => {
    expect(candidatesFor(library).map((candidate) => candidate.name)).toEqual([
      "Paruppu Sadham",
      "Tomato Rice",
      "Chicken Biryani",
    ]);

    const tied: NormaliseCandidate[] = [
      { id: "y", name: "Upma", timesEaten: 3 },
      { id: "x", name: "Dosa", timesEaten: 3 },
    ];
    expect(candidatesFor(tied).map((candidate) => candidate.name)).toEqual(["Dosa", "Upma"]);
  });

  it("caps a long library so its tail does not ride along in every prompt", () => {
    const long = Array.from({ length: FOOD_NORMALISE_MAX_CANDIDATES + 20 }, (_, index) => ({
      id: String(index),
      name: `Food ${index}`,
      timesEaten: index,
    }));

    expect(candidatesFor(long)).toHaveLength(FOOD_NORMALISE_MAX_CANDIDATES);
    // The cap keeps the most-cooked, not the first the database happened to return.
    expect(candidatesFor(long)[0].timesEaten).toBe(FOOD_NORMALISE_MAX_CANDIDATES + 19);
  });

  it("does not mutate the library it was given", () => {
    const original = library.map((candidate) => candidate.name);
    candidatesFor(library);
    expect(library.map((candidate) => candidate.name)).toEqual(original);
  });
});

describe("the payload numbers the candidates from one", () => {
  it("matches the numbering the prompt and the validator agree on", () => {
    const payload = payloadFor("Parupu Rice", library);

    expect(payload.typed_name).toBe("Parupu Rice");
    expect(payload.candidates).toEqual([
      { n: 1, name: "Paruppu Sadham" },
      { n: 2, name: "Tomato Rice" },
      { n: 3, name: "Chicken Biryani" },
    ]);

    // The contract between the two: n round-trips through the validator.
    for (const candidate of payload.candidates) {
      expect(
        validateNormalisation({
          response: { match: candidate.n, confidence: 1 },
          typedName: "Parupu Rice",
          candidates: library,
        })?.name,
      ).toBe(candidate.name);
    }
  });

  it("sends no identifiers, only names", () => {
    // The library's UUIDs are ours; the model needs a name and an index. Real
    // ids here rather than the fixture's single letters, which occur inside the
    // dish names and would pass this by accident.
    const identified: NormaliseCandidate[] = [
      { id: "3f0c1c8e-2d4b-4a19-9f77-0b2a6c1d5e44", name: "Paruppu Sadham", timesEaten: 12 },
      { id: "8b71a2d0-55e3-4c6f-9a10-77ce2f4b8d31", name: "Tomato Rice", timesEaten: 9 },
    ];

    const serialised = JSON.stringify(payloadFor("Parupu Rice", identified));
    for (const candidate of identified) {
      expect(serialised).not.toContain(candidate.id);
    }
  });
});

describe("the response schema lets the model say no", () => {
  it("admits zero, so refusing does not require inventing a match", () => {
    expect(FOOD_NORMALISE_RESPONSE_SCHEMA.properties?.match).toMatchObject({
      type: "integer",
      minimum: 0,
    });
  });
});
