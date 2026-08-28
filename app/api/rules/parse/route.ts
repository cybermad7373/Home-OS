import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireLeadMembership, requireSession } from "@/lib/data/house";
import { ruleParseContext } from "@/lib/data/rules";
import {
  RULE_PARSE_MAX_TOKENS,
  RULE_PARSE_RESPONSE_SCHEMA,
  RULE_PARSE_SYSTEM_PROMPT,
  RULE_PARSE_TEMPERATURE,
  buildRuleParsePayload,
  normaliseRuleParse,
  type RuleParseResponse,
} from "@/lib/domain/rules/parse";
import {
  RULE_PARSE_CAP_PER_DAY,
  countHouseCall,
  underHouseCap,
} from "@/lib/infra/llm/rate";
// Aliased: `route` from `lib/api/handler` is the handler wrapper below.
import { route as routeLlm } from "@/lib/infra/llm/router";
import { houseToday } from "@/lib/utils/date";
import { parseRuleSchema } from "@/lib/validation/rules";

/**
 * POST /api/rules/parse — call site 4. docs/10-LLM-SPEC.md section 8.
 *
 * **It stores nothing.** What comes back fills in a form the Admin then edits
 * and submits, and the rule still needs the Home's governance before it is live
 * (RL-03, RL-04).
 *
 * The fallback is the part to get right. No key, `rule_parsing` switched off, a
 * rate cap, a timeout, a schema failure — every one of them answers `200` with
 * `{ parsed_by: "manual", proposal: null }`, and the client shows the
 * structured form with the text the Admin already typed. **This is not an error
 * state and the interface must not present it as one:** it is the ordinary way
 * to write a rule in a Home that has no AI configured, and rules are not an AI
 * feature (RL-08).
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireLeadMembership(session);
  const { text } = await parseBody(request, parseRuleSchema);

  const today = houseToday(house.timezone);
  const manual = { parsed_by: "manual" as const, proposal: null, confidence: 0, flags: [] };

  // Twenty per Home per day. Over the cap the form still works, which is why
  // this is a quiet fallback rather than the 429 the natural-language endpoint
  // returns: there the cap means "type it into the form instead", and here the
  // form is already on screen.
  if (!underHouseCap(house.id, "rule_parse", today, RULE_PARSE_CAP_PER_DAY)) {
    return jsonResponse(manual);
  }

  const provider = await routeLlm(house.id, "rule_parsing");
  if (!provider) return jsonResponse(manual);

  const ctx = await ruleParseContext(session, house.id);

  countHouseCall(house.id, "rule_parse", today);

  const result = await provider.complete<RuleParseResponse>({
    purpose: "rule_parse",
    system: RULE_PARSE_SYSTEM_PROMPT,
    // The Admin's own text, verbatim. The one place a member's free text is
    // sent deliberately, because it *is* the input — and the Admin sees exactly
    // what will be sent before they tap (the redaction contract, section 4).
    user: JSON.stringify(buildRuleParsePayload(text, ctx)),
    schema: RULE_PARSE_RESPONSE_SCHEMA,
    maxTokens: RULE_PARSE_MAX_TOKENS,
    temperature: RULE_PARSE_TEMPERATURE,
  });

  if (!result.ok || !result.data) return jsonResponse(manual);

  const { proposal, confidence, flags } = normaliseRuleParse(result.data, ctx, text);

  return jsonResponse({
    parsed_by: "ai" as const,
    confidence,
    /** Fields the Admin should look at twice — `applies_to` above all. */
    flags,
    proposal: {
      title: proposal.title,
      original_text: proposal.originalText,
      condition: proposal.condition,
      action: proposal.action,
      applies_to: proposal.appliesTo,
      weight_points: proposal.weightPoints,
      penalty_paise: proposal.penaltyPaise,
      starts_on: proposal.startsOn,
      ends_on: proposal.endsOn,
    },
    // Stated in the response as well as in the specification, because it is the
    // guarantee this endpoint exists to keep: AI never activates a rule.
    requires_confirmation: true,
  });
});
