import { route } from "@/lib/infra/llm/router";
import {
  FOOD_NORMALISE_MAX_TOKENS,
  FOOD_NORMALISE_RESPONSE_SCHEMA,
  FOOD_NORMALISE_SYSTEM_PROMPT,
  FOOD_NORMALISE_TEMPERATURE,
  candidatesFor,
  payloadFor,
  validateNormalisation,
  type NormaliseCandidate,
  type RawFoodNormaliseResponse,
} from "@/lib/domain/llm/food-normalise";

/**
 * Call site 6 — Food normalisation. docs/10-LLM-SPEC.md section 3.6a, FD-10.
 *
 * It takes the library rather than reading it, which is why this is its own
 * module and not part of `food-llm.ts`: the only caller is `matchFood`, in
 * `food.ts`, which has already loaded the Home's foods to run the
 * deterministic pass. Importing this from there would otherwise close a cycle
 * — `food` → `food-llm` → `food` — and pay for a second read of the same rows
 * to do it.
 *
 * The answer is never authoritative. It returns one candidate the Home already
 * has, for a person to confirm, or null. Null is every failure — no key,
 * capability off, breaker open, an unparseable reply, a reply naming something
 * that was not in the list we sent — and the caller reads all of them the same
 * way, as "the name is new", which is what the deterministic matcher had
 * already decided.
 */
export async function suggestFoodMatch(
  houseId: string,
  typedName: string,
  library: NormaliseCandidate[],
): Promise<NormaliseCandidate | null> {
  try {
    return await suggestFoodMatchUnsafe(houseId, typedName, library);
  } catch {
    return null;
  }
}

async function suggestFoodMatchUnsafe(
  houseId: string,
  typedName: string,
  library: NormaliseCandidate[],
): Promise<NormaliseCandidate | null> {
  // Nothing to match against. Asking a model to choose from an empty list can
  // only produce an invention, so the call is not made — and it is checked
  // before routing, so a Home with an empty library never spends a request on
  // a question with no possible right answer.
  const candidates = candidatesFor(library);
  if (candidates.length === 0) return null;

  const provider = await route(houseId, "food_normalise");
  if (!provider) return null;

  const result = await provider.complete<RawFoodNormaliseResponse>({
    purpose: "food_normalise",
    system: FOOD_NORMALISE_SYSTEM_PROMPT,
    user: JSON.stringify(payloadFor(typedName, candidates)),
    schema: FOOD_NORMALISE_RESPONSE_SCHEMA,
    maxTokens: FOOD_NORMALISE_MAX_TOKENS,
    temperature: FOOD_NORMALISE_TEMPERATURE,
  });

  if (!result.ok || !result.data) return null;

  return validateNormalisation({ response: result.data, typedName, candidates });
}
