import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { listAssignments } from "@/lib/data/chores";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { listCategories } from "@/lib/data/expenses";
import {
  PARSE_MAX_TOKENS,
  PARSE_RESPONSE_SCHEMA,
  PARSE_SYSTEM_PROMPT,
  PARSE_TEMPERATURE,
  buildParsePayload,
  normaliseParse,
  type ParseResponse,
} from "@/lib/domain/llm/parse";
import { countParse, underParseCap } from "@/lib/infra/llm/rate";
import { resolveLlm } from "@/lib/infra/llm/resolve";
import { houseToday } from "@/lib/utils/date";
import { parseTextSchema } from "@/lib/validation/ai";

/**
 * POST /api/ai/parse — natural-language entry.
 *
 * **It never writes.** What comes back is a proposal that pre-fills a form the
 * user confirms with a tap, which is the rule that makes an occasionally-wrong
 * model harmless here (spec section 7.4).
 *
 * With no key configured: 501 `AI_DISABLED`, and the client falls back to the
 * manual form it already has.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house, member } = await requireActiveMembership(session);
  const { text } = await parseBody(request, parseTextSchema);

  const today = houseToday(house.timezone);
  if (!underParseCap(member.id, today)) throw new ApiError("RATE_LIMITED");

  const provider = await resolveLlm(house.id);
  if (!provider) throw new ApiError("AI_DISABLED");

  const [categories, assignments] = await Promise.all([
    listCategories(session, house.id),
    listAssignments(session, house.id, { from: today, to: today }, member.id),
  ]);

  const ctx = {
    today,
    categories: categories.map((category) => category.name),
    openChores: assignments
      .filter((assignment) => assignment.status === "assigned")
      .map((assignment) => ({
        id: assignment.id,
        chore: assignment.name,
        date: assignment.choreDate,
      })),
  };

  countParse(member.id, today);

  const result = await provider.complete<ParseResponse>({
    purpose: "nl_parse",
    system: PARSE_SYSTEM_PROMPT,
    user: JSON.stringify(buildParsePayload(text, ctx)),
    schema: PARSE_RESPONSE_SCHEMA,
    maxTokens: PARSE_MAX_TOKENS,
    temperature: PARSE_TEMPERATURE,
  });

  // A failed call is not an error the user should see. The quick-add field goes
  // quiet and the ordinary form is one tap away, which is where they were going
  // anyway.
  if (!result.ok || !result.data) {
    return jsonResponse({
      intent: "unknown",
      confidence: 0,
      presentation: "empty",
      requires_confirmation: true,
      clarification: "Couldn't read that one — fill it in and it's saved.",
      adjustments: [],
    });
  }

  const proposal = normaliseParse(result.data, ctx, text);

  return jsonResponse({
    intent: proposal.intent,
    confidence: proposal.confidence,
    presentation: proposal.presentation,
    proposal: proposal.expense ?? proposal.chore ?? null,
    clarification: proposal.clarification ?? null,
    adjustments: proposal.adjustments,
    // Stated in the response as well as in the specification, because it is the
    // guarantee this endpoint exists to keep.
    requires_confirmation: true,
  });
});
