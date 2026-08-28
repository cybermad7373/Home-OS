import { z } from "zod";
import { isoDateSchema } from "./common";
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
} from "@/lib/domain/rules/types";

/**
 * Rule request bodies — docs/05-API-SPEC.md section 4, docs/14-GOVERNANCE-SPEC.md
 * section 6.
 *
 * The bounds here are the same bounds migration 066's check constraints apply,
 * stated twice on purpose: a person filling in a form should be told which
 * field is wrong before they send it, and a service-role key writing directly
 * should still be refused. Neither copy is decoration for the other.
 */

export const conditionKindSchema = z.enum(CONDITION_KINDS);
export const actionKindSchema = z.enum(ACTION_KINDS);
export const appliesToKindSchema = z.enum(APPLIES_TO_KINDS);

const shortText = z.string().trim().min(1).max(MAX_TEXT_LENGTH);

export const ruleConditionSchema = z.object({
  kind: conditionKindSchema,
  template: shortText.optional(),
  state: shortText.optional(),
  at: shortText.optional(),
  after: shortText.optional(),
  amount_paise: z.number().int().min(0).max(100_000_000).optional(),
  description: shortText.optional(),
});

export const ruleActionSchema = z.object({
  kind: actionKindSchema,
  text: shortText.optional(),
  description: shortText.optional(),
});

export const ruleAppliesToSchema = z.object({
  kind: appliesToKindSchema,
  value: shortText.optional(),
  /**
   * `named_members` is the one audience the parse may never produce. A rule
   * about a named person is built by the Admin picking them from a list after
   * the parse, which is why these arrive as ids and never as text.
   */
  member_ids: z.array(z.string().uuid()).max(50).optional(),
});

export const ruleTitleSchema = z
  .string()
  .trim()
  .min(3, "Give the rule a short name")
  .max(MAX_TITLE_LENGTH, "Keep the name under 60 characters");

/** RL-09 — kept verbatim, forever, so it is required even on a form-built rule. */
export const ruleOriginalTextSchema = z
  .string()
  .trim()
  .min(3, "Write the rule in your own words")
  .max(MAX_ORIGINAL_TEXT_LENGTH);

export const weightPointsSchema = z
  .number()
  .int()
  .min(MIN_WEIGHT_POINTS, "A weight is between 1 and 100 points")
  .max(MAX_WEIGHT_POINTS, "A weight is between 1 and 100 points");

export const penaltyPaiseSchema = z
  .number()
  .int()
  .min(MIN_PENALTY_PAISE, "A penalty cannot be negative")
  .max(MAX_PENALTY_PAISE, "A penalty above ₹10,000 needs a conversation, not a rule");

const ruleBody = {
  title: ruleTitleSchema,
  original_text: ruleOriginalTextSchema,
  condition: ruleConditionSchema,
  action: ruleActionSchema,
  applies_to: ruleAppliesToSchema,
  weight_points: weightPointsSchema.nullish(),
  penalty_paise: penaltyPaiseSchema.nullish(),
  starts_on: isoDateSchema.nullish(),
  ends_on: isoDateSchema.nullish(),
  /** Whether the structured fields started life as a parse (RL-09). */
  parsed_by: z.enum(["manual", "ai"]).optional().default("manual"),
  /**
   * `change_rule` is Critical, so the decision needs a reason (§3). It is asked
   * for here rather than defaulted, because "why is the Home being asked this"
   * is the field the record is poorest without.
   */
  reason: z.string().trim().min(3, "Say why").max(500),
};

const datesInOrder = (body: { starts_on?: string | null; ends_on?: string | null }) =>
  !body.starts_on || !body.ends_on || body.ends_on >= body.starts_on;

export const createRuleSchema = z
  .object(ruleBody)
  .refine(datesInOrder, { path: ["ends_on"], message: "The end date is before the start" });

/**
 * An edit is the same body plus what changed and why, and it is a whole
 * version rather than a patch: `home_rule_versions` stores a snapshot, and a
 * partial update would make the history answer "from what, to what" (RL-07)
 * with a diff against fields the caller happened to send.
 */
export const updateRuleSchema = z
  .object({
    ...ruleBody,
    change_reason: z.string().trim().min(3, "Say what changed").max(500).optional(),
  })
  .refine(datesInOrder, { path: ["ends_on"], message: "The end date is before the start" });

/** Disabling is a version transition, not a delete, so it carries a reason too. */
export const disableRuleSchema = z.object({
  reason: z.string().trim().min(3, "Say why").max(500),
});

export const parseRuleSchema = z.object({
  text: ruleOriginalTextSchema,
});

export type RuleConditionInput = z.infer<typeof ruleConditionSchema>;
export type RuleActionInput = z.infer<typeof ruleActionSchema>;
export type RuleAppliesToInput = z.infer<typeof ruleAppliesToSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type DisableRuleInput = z.infer<typeof disableRuleSchema>;
