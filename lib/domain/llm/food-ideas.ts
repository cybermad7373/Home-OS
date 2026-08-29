import type { JsonSchema } from "@/lib/infra/llm/types";
import { normaliseFoodName } from "@/lib/domain/food/dedup";

/**
 * Call site 5 — Food ideas. docs/10-LLM-SPEC.md section 9.
 *
 * Writes nothing — not a meal, not an expense, not a library entry, not a
 * preference (FD-17). The library half of Try Today is what the Home has
 * already eaten; this is two ideas it has not, kept visibly separate so both
 * halves stay trustworthy (FD-14). Every check in `validateIdeas` runs on our
 * side of the call — a prompt is a request, a filter is a guarantee
 * (BR-225) — because failing any one of them drops the AI half whole rather
 * than returning a partially-trusted answer.
 */

export const FOOD_IDEAS_SYSTEM_PROMPT = `You suggest two meal ideas for a shared home, for their next meal.

You will receive where they live, what they usually eat, what they like and
dislike, what they have eaten recently, and how their food spending is going
this month.

Suggest two dishes they have NOT already got in their list of usual meals.
Prefer things that fit their region, the season, and their budget position.
Avoid anything containing an ingredient on their dislike list.

NEVER suggest anything containing an ingredient on their excluded list. Those
are allergies and restrictions, not preferences. If you cannot suggest two
dishes without them, return an empty list.

Give a realistic estimated cost per person in rupees, as a number.

Do NOT name a restaurant, a shop, a brand or a delivery service. Do NOT claim
anything is available nearby, open now, or on offer. You do not know that. Use
the location only to choose dishes and price ranges that make sense there.

Return only JSON matching the schema.`;

export const FOOD_IDEAS_TEMPERATURE = 0.8;
export const FOOD_IDEAS_MAX_TOKENS = 500;

export interface FoodIdeasPayload {
  location: { city: string | null; state: string | null; country: string | null };
  meal_type: string;
  season: string | null;
  popular_meals: string[];
  liked_items: string[];
  disliked_items: string[];
  excluded_items: string[];
  recent_meals: { name: string; days_ago: number }[];
  budget_state: "comfortable" | "tight" | "over";
  outside_food_frequency: "low" | "medium" | "high";
  typical_per_person_paise: number | null;
}

export const FOOD_IDEAS_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["ideas"],
  additionalProperties: false,
  properties: {
    ideas: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        required: ["name", "description", "estimated_per_person_rupees", "items"],
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 60 },
          description: { type: "string", maxLength: 120 },
          estimated_per_person_rupees: { type: "number", minimum: 1, maximum: 5000 },
          items: { type: "array", items: { type: "string" }, maxItems: 8 },
        },
      },
    },
  },
};

export interface RawFoodIdea {
  name: string;
  description: string;
  estimated_per_person_rupees: number;
  items: string[];
}

export interface RawFoodIdeasResponse {
  ideas: RawFoodIdea[];
}

export interface FoodIdea {
  name: string;
  description: string;
  estimatedPerPersonPaise: number;
  items: string[];
}

const BRAND_PATTERN =
  /\b(mcdonald'?s|kfc|dominos?|pizza hut|burger king|subway|starbucks|swiggy|zomato|uber eats|dunzo|ccd|cafe coffee day|taco bell|wendy'?s)\b/i;

// Any run of two or more capitalised words is a plausible brand-name shape —
// deliberately blunt (section 9.4): a false positive costs two suggestions, a
// false negative puts an unverifiable claim in front of a Home that will act
// on it (FD-19, BR-215).
const CAPITALISED_RUN_PATTERN = /\b([A-Z][a-z]+\s+){1,}[A-Z][a-z]+\b/;

const AVAILABILITY_CLAIM_PATTERN =
  /\b(near you|nearby|open now|open|available at|order from|delivery)\b/i;

function containsCanonical(haystack: string, needle: string): boolean {
  const a = normaliseFoodName(haystack);
  const b = normaliseFoodName(needle);
  if (a.length === 0 || b.length === 0) return false;
  return a.includes(b) || b.includes(a);
}

function matchesAnyItem(text: string, items: string[]): boolean {
  return items.some((item) => containsCanonical(text, item));
}

function ideaText(idea: RawFoodIdea): string {
  return [idea.name, idea.description, ...idea.items].join(" ");
}

export interface ValidateIdeasInput {
  ideas: RawFoodIdea[];
  libraryNames: string[];
  dislikedItems: string[];
  excludedItems: string[];
}

/**
 * Section 9.4 — any failure drops the whole AI half. All-or-nothing by
 * design: a response that failed one check has demonstrated it is not
 * following instructions, so its other fields are not evidence of anything.
 */
export function validateIdeas(input: ValidateIdeasInput): FoodIdea[] | null {
  if (input.ideas.length !== 2) return null;

  const normalisedLibrary = new Set(input.libraryNames.map(normaliseFoodName));

  for (const idea of input.ideas) {
    if (normalisedLibrary.has(normaliseFoodName(idea.name))) return null;

    const text = ideaText(idea);
    if (matchesAnyItem(text, input.dislikedItems)) return null;
    if (matchesAnyItem(text, input.excludedItems)) return null;

    if (idea.estimated_per_person_rupees < 1 || idea.estimated_per_person_rupees > 5000) {
      return null;
    }

    if (BRAND_PATTERN.test(text) || CAPITALISED_RUN_PATTERN.test(idea.description)) return null;
    if (AVAILABILITY_CLAIM_PATTERN.test(idea.description)) return null;
  }

  return input.ideas.map((idea) => ({
    name: idea.name,
    description: idea.description,
    estimatedPerPersonPaise: Math.round(idea.estimated_per_person_rupees * 100),
    items: idea.items,
  }));
}
