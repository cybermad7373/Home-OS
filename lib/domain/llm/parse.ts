import type { JsonSchema } from "@/lib/infra/llm/types";

/**
 * Call site 3 — natural-language entry. docs/10-LLM-SPEC.md section 7.
 *
 * This call never writes anything. It returns a proposal that pre-fills a form
 * the user must confirm with a tap, which is the rule that makes an
 * occasionally-wrong model harmless here.
 */

export const PARSE_SYSTEM_PROMPT = `You convert a housemate's short message into a structured record.

There are exactly three possible intents:
- "expense": they spent money on something for the house
- "chore_done": they completed a household chore
- "unknown": anything else

For an expense, extract the amount in rupees, the best-matching category from
the list provided, the date, and a short description.
For a chore, match to the closest chore in their current assignments.

Relative dates resolve against the "today" value given. "Yesterday" is one day
before it.

If you are unsure, say so with a low confidence value. A wrong guess costs the
user more than an admission of uncertainty.

Return only JSON matching the schema.`;

export const PARSE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["intent", "confidence"],
  additionalProperties: false,
  properties: {
    intent: { enum: ["expense", "chore_done", "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    expense: {
      type: "object",
      properties: {
        amount_rupees: { type: "number", minimum: 0.01 },
        category: { type: "string" },
        date: { type: "string", format: "date" },
        description: { type: "string", maxLength: 100 },
      },
    },
    chore_done: {
      type: "object",
      properties: { assignment_id: { type: "string" } },
    },
    clarification: { type: "string", maxLength: 160 },
  },
};

export const PARSE_TEMPERATURE = 0.1;
export const PARSE_MAX_TOKENS = 400;

/** Section 8 — one member cannot spend the house's whole minute budget typing. */
export const PARSE_DAILY_CAP_PER_MEMBER = 20;

export const CONFIDENT = 0.85;
export const UNCERTAIN = 0.7;

export const MAX_AGE_DAYS = 180;
export const MIN_AMOUNT_RUPEES = 0.01;
export const MAX_AMOUNT_RUPEES = 1_000_000;
export const FALLBACK_CATEGORY = "Other";

export interface ParseContext {
  today: string;
  categories: string[];
  openChores: { id: string; chore: string; date: string }[];
}

export interface ParseResponse {
  intent: "expense" | "chore_done" | "unknown";
  confidence: number;
  expense?: {
    amount_rupees?: number;
    category?: string;
    date?: string;
    description?: string;
  };
  chore_done?: { assignment_id?: string };
  clarification?: string;
}

export interface ParseProposal {
  intent: "expense" | "chore_done" | "unknown";
  confidence: number;
  /** How the form should behave — section 7.4's confidence table. */
  presentation: "prefilled" | "prefilled_warn" | "empty";
  expense?: {
    amount: string;
    category: string;
    expense_date: string;
    description: string;
  };
  chore?: { assignment_id: string; chore: string };
  clarification?: string;
  /** What was corrected on the way, so the UI can say which fields to check. */
  adjustments: string[];
}

/** The payload. The member's own text is theirs, so it is sent as typed. */
export function buildParsePayload(text: string, ctx: ParseContext): Record<string, unknown> {
  return {
    text,
    today: ctx.today,
    categories: ctx.categories,
    my_open_chores: ctx.openChores.map((chore, index) => ({
      id: `a${index + 1}`,
      chore: chore.chore,
      date: chore.date,
    })),
  };
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Section 7.4 — validation, then the confidence band.
 *
 * A wrong category or a stale date is corrected and noted; an impossible amount
 * or an assignment that is not the member's own rejects the intent outright,
 * because those are the two that would put a wrong record in front of somebody
 * with the save button already enabled.
 */
export function normaliseParse(
  response: ParseResponse,
  ctx: ParseContext,
  text: string,
): ParseProposal {
  const adjustments: string[] = [];
  const confidence = clamp(response.confidence);
  const presentation: ParseProposal["presentation"] =
    confidence >= CONFIDENT ? "prefilled" : confidence >= UNCERTAIN ? "prefilled_warn" : "empty";

  if (response.intent === "unknown" || presentation === "empty") {
    return {
      intent: response.intent,
      confidence,
      presentation: "empty",
      clarification: response.clarification,
      adjustments,
    };
  }

  if (response.intent === "expense") {
    const amount = response.expense?.amount_rupees;
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < MIN_AMOUNT_RUPEES ||
      amount > MAX_AMOUNT_RUPEES
    ) {
      return {
        intent: "unknown",
        confidence,
        presentation: "empty",
        clarification: "Type the amount and I'll fill in the rest.",
        adjustments: ["AMOUNT_REJECTED"],
      };
    }

    let category = response.expense?.category?.trim() ?? "";
    if (!ctx.categories.includes(category)) {
      category = ctx.categories.includes(FALLBACK_CATEGORY)
        ? FALLBACK_CATEGORY
        : (ctx.categories[0] ?? FALLBACK_CATEGORY);
      adjustments.push("CATEGORY_FALLBACK");
    }

    let date = response.expense?.date ?? ctx.today;
    const age = daysBetween(date, ctx.today);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || age < 0 || age > MAX_AGE_DAYS) {
      date = ctx.today;
      adjustments.push("DATE_FALLBACK");
    }

    return {
      intent: "expense",
      confidence,
      presentation,
      expense: {
        amount: amount.toFixed(2),
        category,
        expense_date: date,
        description: (response.expense?.description ?? text).slice(0, 100),
      },
      clarification: response.clarification,
      adjustments,
    };
  }

  // chore_done. The opaque `a{n}` is resolved locally; an id that is not one of
  // this member's own open chores is refused rather than guessed at.
  const opaque = response.chore_done?.assignment_id ?? "";
  const index = /^a(\d+)$/.exec(opaque);
  const chore = index ? ctx.openChores[Number(index[1]) - 1] : undefined;

  if (!chore) {
    return {
      intent: "unknown",
      confidence,
      presentation: "empty",
      clarification: "Which chore was it? Tap it on your list.",
      adjustments: ["UNKNOWN_ASSIGNMENT"],
    };
  }

  return {
    intent: "chore_done",
    confidence,
    presentation,
    chore: { assignment_id: chore.id, chore: chore.chore },
    clarification: response.clarification,
    adjustments,
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
