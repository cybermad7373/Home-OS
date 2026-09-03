import type { JsonSchema } from "@/lib/infra/llm/types";
import { normaliseFoodName } from "@/lib/domain/food/dedup";

/**
 * Call site 6 — Food normalisation. docs/10-LLM-SPEC.md section 3.6a,
 * docs/15-FOOD-SPEC.md section 4.1 and FD-10.
 *
 * The deterministic matcher runs first and is unchanged: exact match on the
 * normalised form, then Levenshtein within a length-scaled threshold. This call
 * site exists for the case that matcher cannot reach — a transliteration that
 * is the same dish and nowhere near the same string. The spec's own example is
 * the four spellings of Paruppu Sadham, of which "Parupu Rice" is 7 edits from
 * "Paruppu Sadham" and would be filed as a new food by any edit distance small
 * enough to be safe.
 *
 * Two properties make this safe to ask a model for, and both are enforced here
 * rather than requested in the prompt (BR-225: a prompt is a request, a filter
 * is a guarantee):
 *
 * 1. **It can only choose, never invent.** The reply is matched back against
 *    the candidates that were sent by normalised name, and anything that is not
 *    one of them is dropped. A model that returns a dish the Home does not have
 *    contributes nothing rather than a new library entry.
 * 2. **It only ever offers.** Nothing here merges, writes or renames. The
 *    output is a suggestion a person confirms, because a wrongly merged food is
 *    worse than a duplicate — a duplicate can be merged later and a merge
 *    cannot be unpicked (section 4.1).
 */

export const FOOD_NORMALISE_SYSTEM_PROMPT = `You match a dish name against a home's existing list of dishes.

You will receive one typed name and a numbered list of dishes the home already
records. Decide whether the typed name is the SAME DISH as one of them, written
differently — a transliteration, a regional spelling, a shortening, or the same
dish named in another language.

Return the number of that dish. Return 0 if the typed name is not any of them.

Two dishes that merely share an ingredient or a style are NOT the same dish.
"Paruppu Sadham" and "Parupu Rice" are the same dish. "Tomato Rice" and "Curd
Rice" are not. "Chicken Biryani" and "Mutton Biryani" are not.

Prefer 0. A wrong match makes the home merge two different foods, which cannot
be undone; a missed match only leaves a duplicate they can merge later.

Return only JSON matching the schema.`;

/** A matching task, not a creative one. */
export const FOOD_NORMALISE_TEMPERATURE = 0;
export const FOOD_NORMALISE_MAX_TOKENS = 120;

/**
 * The most candidates worth sending. The library is ordered by `times_eaten`,
 * so the head of it is what the Home actually cooks; a hundred-entry library
 * would otherwise put its long tail in every prompt at no benefit.
 */
export const FOOD_NORMALISE_MAX_CANDIDATES = 40;

export interface FoodNormalisePayload {
  typed_name: string;
  candidates: { n: number; name: string }[];
}

export const FOOD_NORMALISE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["match"],
  additionalProperties: false,
  properties: {
    // Zero rather than null. "None of them" is the expected answer and has to
    // be sayable without the model inventing a match to satisfy the schema —
    // and the shared `JsonSchema` has no nullable union, so a sentinel inside
    // the integer domain says it without widening a type every call site uses.
    match: { type: "integer", minimum: 0 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

export interface RawFoodNormaliseResponse {
  /** One-based index into the candidates that were sent; 0 means none of them. */
  match: number | null;
  confidence?: number;
}

/**
 * Below this, the answer is treated as "no match". A model that is unsure is
 * telling us to leave the name alone, and the cost of believing it anyway is a
 * merge the Home cannot undo.
 */
export const FOOD_NORMALISE_MIN_CONFIDENCE = 0.7;

export interface NormaliseCandidate {
  id: string;
  name: string;
  timesEaten: number;
}

/**
 * Turns a reply into at most one candidate the Home already has, or null.
 *
 * Everything that could make the answer untrustworthy resolves to null: the
 * documented 0 for "none of them", an index outside the list that was sent, a
 * confidence below the bar, or a "match" that normalises to the typed name
 * itself — which is not a transliteration, it is the deterministic exact match
 * that already ran and did not fire.
 */
export function validateNormalisation(input: {
  response: RawFoodNormaliseResponse;
  typedName: string;
  candidates: NormaliseCandidate[];
}): NormaliseCandidate | null {
  const { response, typedName, candidates } = input;

  if (response.match === null || response.match === undefined) return null;
  if (!Number.isInteger(response.match)) return null;
  // 0 is the documented "none of them", and anything negative is nonsense.
  if (response.match < 1) return null;

  // `confidence` is optional in the schema; a reply that omits it is treated as
  // certain, because the bar exists to catch a model that volunteered a low
  // number, not to require one.
  if (response.confidence !== undefined && response.confidence < FOOD_NORMALISE_MIN_CONFIDENCE) {
    return null;
  }

  // One-based, matching the numbering the prompt sends.
  const chosen = candidates[response.match - 1];
  if (!chosen) return null;

  if (normaliseFoodName(chosen.name) === normaliseFoodName(typedName)) return null;

  return chosen;
}

/** The candidates worth sending, most-cooked first. */
export function candidatesFor(library: NormaliseCandidate[]): NormaliseCandidate[] {
  return [...library]
    .sort((a, b) => b.timesEaten - a.timesEaten || a.name.localeCompare(b.name))
    .slice(0, FOOD_NORMALISE_MAX_CANDIDATES);
}

export function payloadFor(
  typedName: string,
  candidates: NormaliseCandidate[],
): FoodNormalisePayload {
  return {
    typed_name: typedName,
    candidates: candidates.map((candidate, index) => ({ n: index + 1, name: candidate.name })),
  };
}
