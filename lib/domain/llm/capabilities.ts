/**
 * The six call sites, as a value — AI-02, docs/10-LLM-SPEC.md section 3.6a.
 *
 * Here rather than in `lib/infra/llm/router.ts` because it is a vocabulary
 * rather than a mechanism: the settings panel renders it, the router consults
 * it, the database constrains its keys, and a test asserts all three agree.
 * The router reaches a repository and therefore the server; this list is a
 * plain array and can be read anywhere.
 */

export type Capability =
  | "schedule_proposals" // call site 1 — schedule proposal
  | "weekly_summary" // call site 2 — weekly fairness digest
  | "natural_language" // call site 3 — natural-language entry
  | "rule_parsing" // call site 4 — rule parsing
  | "food_ideas" // call site 5 — food ideas
  | "food_normalise"; // call site 6 — meal-name normalisation

export const CAPABILITIES: Capability[] = [
  "schedule_proposals",
  "weekly_summary",
  "natural_language",
  "rule_parsing",
  "food_ideas",
  "food_normalise",
];

/** One line each, for the six switches under the key in the settings panel. */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  schedule_proposals: "Suggest who should do what, before a week is generated",
  weekly_summary: "Write the weekly fairness summary in words",
  natural_language: "Turn a typed sentence into an expense or a done chore",
  rule_parsing: "Turn a house rule you have written into a form you can check",
  food_ideas: "Suggest two things to eat, alongside the two from your library",
  food_normalise: "Recognise four spellings of one dish as the same dish",
};

/**
 * The Home's switch for one call site, given whatever is stored.
 *
 * Null capabilities mean "this Home has no credential row of its own", which is
 * not the same as every switch being off: the environment fallback serves those
 * Homes and has all six on. A single-house self-host that set `LLM_API_KEY`
 * meant to enable AI, and there is no row for it to have expressed a narrower
 * intention in.
 *
 * An absent key is on, too. A Home whose row predates a call site did not
 * decide anything about it, and defaulting a new feature to off would make the
 * switches a thing every Home has to visit after every release.
 */
export function isCapabilityOn(
  capabilities: Record<string, boolean> | null | undefined,
  capability: Capability,
): boolean {
  if (!capabilities) return true;
  return capabilities[capability] !== false;
}
