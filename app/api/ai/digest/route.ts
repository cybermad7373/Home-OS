import { jsonResponse, route } from "@/lib/api/handler";
import { weekStartOf } from "@/lib/data/chores";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { getDigestInput } from "@/lib/data/llm";
import {
  DIGEST_MAX_TOKENS,
  DIGEST_RESPONSE_SCHEMA,
  DIGEST_SYSTEM_PROMPT,
  DIGEST_TEMPERATURE,
  buildDigestPayload,
  buildTemplateDigest,
  validateDigest,
  type DigestResponse,
} from "@/lib/domain/llm/digest";
import { resolveLlm } from "@/lib/infra/llm/resolve";
import { houseToday } from "@/lib/utils/date";
import { digestQuerySchema } from "@/lib/validation/ai";

/**
 * GET /api/ai/digest — the weekly fairness summary.
 *
 * **This endpoint never fails.** With no key, with a rejected key, or with a
 * summary that names somebody who does not live here, it answers with the
 * deterministic digest, which is less readable than the model's version and is
 * never wrong.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const url = new URL(request.url);
  const query = digestQuerySchema.parse({
    week_start: url.searchParams.get("week_start") ?? undefined,
  });

  // The week that has just ended, unless one is named.
  const weekStart = query.week_start ?? previousWeekStart(houseToday(house.timezone));
  const input = await getDigestInput(session, house.id, weekStart);

  const template = buildTemplateDigest(input);

  if (input.members.length === 0) {
    return jsonResponse({
      generated: false,
      week_start: weekStart,
      summary: template.summary,
      highlights: template.highlights,
      next_week_correction: template.next_week_note,
    });
  }

  const provider = await resolveLlm(house.id);
  if (!provider) {
    return jsonResponse({
      generated: false,
      week_start: weekStart,
      summary: template.summary,
      highlights: template.highlights,
      next_week_correction: template.next_week_note,
    });
  }

  const result = await provider.complete<DigestResponse>({
    purpose: "digest",
    system: DIGEST_SYSTEM_PROMPT,
    user: JSON.stringify(buildDigestPayload(input)),
    schema: DIGEST_RESPONSE_SCHEMA,
    maxTokens: DIGEST_MAX_TOKENS,
    temperature: DIGEST_TEMPERATURE,
  });

  const accepted =
    result.ok && result.data ? validateDigest(result.data, input) : { valid: false, errors: [] };

  if (!result.ok || !result.data || !accepted.valid) {
    return jsonResponse({
      generated: false,
      week_start: weekStart,
      summary: template.summary,
      highlights: template.highlights,
      next_week_correction: template.next_week_note,
    });
  }

  return jsonResponse({
    generated: true,
    week_start: weekStart,
    model: provider.model,
    summary: result.data.summary,
    highlights: result.data.highlights,
    next_week_correction: result.data.next_week_note,
  });
});

function previousWeekStart(isoDate: string): string {
  const monday = new Date(`${weekStartOf(isoDate)}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return monday.toISOString().slice(0, 10);
}
