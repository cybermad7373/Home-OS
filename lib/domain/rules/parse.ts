import type { JsonSchema } from "@/lib/infra/llm/types";
import {
  ACTION_KINDS,
  APPLIES_TO_KINDS,
  CONDITION_KINDS,
  MAX_ORIGINAL_TEXT_LENGTH,
  MAX_PENALTY_PAISE,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_WEIGHT_POINTS,
  MIN_PENALTY_PAISE,
  MIN_WEIGHT_POINTS,
  type ActionKind,
  type AppliesToKind,
  type ConditionKind,
  type RuleProposal,
} from "./types";

/**
 * Call site 4 — rule parsing. docs/10-LLM-SPEC.md section 8.
 *
 * **This call stores nothing.** It fills in a form the Admin then edits and
 * submits, and the rule still needs the Home's governance before it is live
 * (RL-03, RL-04). Every field it produces is rendered as an editable form field
 * and never as a saved value.
 *
 * Why a model at all, when the alternative is a form: a Home's actual rules are
 * sentences — "nobody leaves unwashed vessels overnight" — and asking somebody
 * to translate that into a condition and an action before they can write it
 * down is how a rules feature goes unused. The model does the translation; the
 * person owns the result.
 */

export const RULE_PARSE_SYSTEM_PROMPT = `You convert a house rule, written in plain language by someone who lives there,
into a structured form they will then check and edit.

Extract:
- a short title, at most six words
- a condition: when does this rule apply
- an action: what should happen
- who it applies to
- a points weight or a money penalty, only if the text states one

Use only the condition kinds and action kinds listed. If the rule does not fit
any of them, use kind "other" and put the text in the description. That is a
correct answer, not a failure — most house rules are agreements rather than
automations.

Never invent a penalty. Never invent a deadline. Never broaden who it applies
to. If the text says "everyone", say everyone; if it says "whoever cooked", say
the responsible person.

Return only JSON matching the schema.`;

export const RULE_PARSE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["title", "condition", "action", "applies_to", "confidence"],
  additionalProperties: false,
  properties: {
    title: { type: "string", maxLength: MAX_TITLE_LENGTH },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    condition: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string" },
        template: { type: "string" },
        state: { type: "string" },
        at: { type: "string" },
        after: { type: "string" },
        description: { type: "string", maxLength: MAX_TEXT_LENGTH },
      },
    },
    action: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string" },
        text: { type: "string", maxLength: MAX_TEXT_LENGTH },
        description: { type: "string", maxLength: MAX_TEXT_LENGTH },
      },
    },
    applies_to: {
      type: "object",
      required: ["kind"],
      properties: { kind: { type: "string" }, value: { type: "string" } },
    },
    weight_points: {
      type: "integer",
      minimum: MIN_WEIGHT_POINTS,
      maximum: MAX_WEIGHT_POINTS,
    },
    penalty_paise: {
      type: "integer",
      minimum: MIN_PENALTY_PAISE,
      maximum: MAX_PENALTY_PAISE,
    },
  },
};

export const RULE_PARSE_TEMPERATURE = 0.2;
export const RULE_PARSE_MAX_TOKENS = 600;

/** docs/05-API-SPEC.md section 15 — per Home, not per member, unlike call site 3. */
export const RULE_PARSE_CAP_PER_DAY = 20;

/** What the parse is told about the Home. Section 8.2, and nothing beyond it. */
export interface RuleParseContext {
  /** Chore template names, which are not personal data. */
  choreTemplates: string[];
  /** Role names the Home actually uses. */
  roles: string[];
  /**
   * Room **labels** — `R1`, `R2` — never room names, which can be personal
   * (SEC-06 and the redaction contract in section 4).
   */
  rooms: string[];
}

export interface RuleParsePayload {
  text: string;
  condition_kinds: readonly string[];
  action_kinds: readonly string[];
  applies_to_kinds: readonly string[];
  chore_templates: string[];
  roles: string[];
  rooms: string[];
}

/**
 * The only permitted construction path for this call site's input.
 *
 * The Admin's own text goes out verbatim, which is the one place a member's
 * free text is sent deliberately — because it *is* the input, and the Admin
 * sees exactly what will be sent before they tap. No member names, no ids, no
 * room names, nothing else from the Home.
 */
export function buildRuleParsePayload(
  text: string,
  ctx: RuleParseContext,
): RuleParsePayload {
  return {
    text: text.trim().slice(0, MAX_ORIGINAL_TEXT_LENGTH),
    condition_kinds: CONDITION_KINDS,
    action_kinds: ACTION_KINDS,
    applies_to_kinds: APPLIES_TO_KINDS,
    chore_templates: ctx.choreTemplates,
    roles: ctx.roles,
    rooms: ctx.rooms,
  };
}

export interface RuleParseResponse {
  title?: unknown;
  confidence?: unknown;
  condition?: unknown;
  action?: unknown;
  applies_to?: unknown;
  weight_points?: unknown;
  penalty_paise?: unknown;
}

/**
 * A field the Admin should look at twice before submitting.
 *
 * `applies_to` is the only one the specification names, because coercing an
 * unrecognised audience to "everyone" broadens a rule rather than narrowing it,
 * and that is the direction worth interrupting somebody over.
 */
export type ParseFlag = "applies_to" | "template_dropped" | "penalty_stripped";

export interface NormalisedRuleParse {
  proposal: RuleProposal;
  confidence: number;
  flags: ParseFlag[];
}

/**
 * Section 8.4 — the validation contract, in the order the table states it.
 *
 * Nothing here fails. Every check turns an unusable answer into a usable form
 * field, because the worst outcome this call site is allowed to have is a form
 * somebody has to fix. The one exception is the money, and it is stripped
 * rather than corrected.
 */
export function normaliseRuleParse(
  response: RuleParseResponse,
  ctx: RuleParseContext,
  originalText: string,
): NormalisedRuleParse {
  const flags: ParseFlag[] = [];
  const text = originalText.trim().slice(0, MAX_ORIGINAL_TEXT_LENGTH);

  const rawCondition = asRecord(response.condition);
  const rawAction = asRecord(response.action);
  const rawAppliesTo = asRecord(response.applies_to);

  // An unrecognised kind is coerced to `other` and the model's own words are
  // kept, so the Admin sees what it understood rather than an empty field.
  const conditionKind: ConditionKind =
    match(rawCondition.kind, CONDITION_KINDS) ?? "other";
  const actionKind: ActionKind = match(rawAction.kind, ACTION_KINDS) ?? "other";

  const appliesToKind = match(rawAppliesTo.kind, APPLIES_TO_KINDS);
  if (appliesToKind === null) flags.push("applies_to");

  // A template the Home does not have is a reference nothing can resolve. The
  // reference is dropped and the Admin picks one; the condition kind stays,
  // because "a chore was missed" is still what the rule is about.
  const template = str(rawCondition.template, MAX_TEXT_LENGTH);
  const knownTemplate =
    template && ctx.choreTemplates.includes(template) ? template : undefined;
  if (template && !knownTemplate) flags.push("template_dropped");

  const numbers = stripInventedNumbers(response, text);
  if (numbers.stripped) flags.push("penalty_stripped");

  const proposal: RuleProposal = {
    title: str(response.title, MAX_TITLE_LENGTH) ?? titleFrom(text),
    originalText: text,
    condition: {
      kind: conditionKind,
      ...(knownTemplate ? { template: knownTemplate } : {}),
      ...pick(rawCondition, "state", "at", "after"),
      ...describe(rawCondition, conditionKind, text),
    },
    action: {
      kind: actionKind,
      ...pick(rawAction, "text"),
      ...describe(rawAction, actionKind, text),
    },
    appliesTo: {
      kind: appliesToKind ?? "all",
      ...pick(rawAppliesTo, "value"),
    },
    weightPoints: numbers.weightPoints,
    penaltyPaise: numbers.penaltyPaise,
    // Never invented. A rule with dates is a rule whose dates the Admin typed.
    startsOn: null,
    endsOn: null,
  };

  return { proposal, confidence: confidenceOf(response.confidence), flags };
}

/**
 * The invented-penalty rule, and the important one in this whole call site.
 *
 * Everything else here has a worst outcome of a form somebody has to fix. A
 * hallucinated "₹50" that an Admin skims past and submits is money, and the
 * Home would have acknowledged it. So the check is mechanical rather than
 * clever: no digit in the original text means no number in the proposal, and
 * the strip is silent — there is nothing to tell the Admin, because the correct
 * state of the field is empty and that is what they see.
 */
function stripInventedNumbers(
  response: RuleParseResponse,
  text: string,
): { weightPoints: number | null; penaltyPaise: number | null; stripped: boolean } {
  const weight = bounded(response.weight_points, MIN_WEIGHT_POINTS, MAX_WEIGHT_POINTS);
  const penalty = bounded(response.penalty_paise, MIN_PENALTY_PAISE, MAX_PENALTY_PAISE);

  if (weight === null && penalty === null) {
    return { weightPoints: null, penaltyPaise: null, stripped: false };
  }

  if (!/\d/.test(text)) {
    return { weightPoints: null, penaltyPaise: null, stripped: true };
  }

  return { weightPoints: weight, penaltyPaise: penalty, stripped: false };
}

// ---------------------------------------------------------------------------
// Small helpers, all total
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, max);
}

/** The kind if it is one of the listed ones, and null if it is not. */
function match<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : null;
}

function pick(
  source: Record<string, unknown>,
  ...keys: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = str(source[key], MAX_TEXT_LENGTH);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * `other` is a correct answer, not a failure — so it must carry the words that
 * make it readable. The model's own description is preferred; the Admin's text
 * is the fallback, because a rule the engine cannot act on is still a rule the
 * Home can point at.
 */
function describe(
  source: Record<string, unknown>,
  kind: ConditionKind | ActionKind,
  text: string,
): Record<string, string> {
  const described = str(source.description, MAX_TEXT_LENGTH);
  if (described) return { description: described };
  if (kind !== "other") return {};
  return { description: text.slice(0, MAX_TEXT_LENGTH) };
}

function bounded(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function confidenceOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Six words, which is what the prompt asks for and what the list can show. */
function titleFrom(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return (words || "House rule").slice(0, MAX_TITLE_LENGTH);
}

export type { ActionKind, AppliesToKind, ConditionKind };
