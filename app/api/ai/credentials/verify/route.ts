import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { createProvider } from "@/lib/infra/llm/adapter";
import { getProvider, resolveModel } from "@/lib/infra/llm/providers";
import type { JsonSchema } from "@/lib/infra/llm/types";
import { verifyCredentialSchema } from "@/lib/validation/ai";

/**
 * POST /api/ai/credentials/verify — admin. **Stores nothing.**
 *
 * A fixed nine-token prompt through the provider the admin picked, with the key
 * they just typed. It answers the only question that matters before saving:
 * does this key, with this model, at this URL, actually reply?
 *
 * A provider that refuses the key is a 200 with `ok: false`, not a 4xx. It is a
 * fact about the key, not a fault in the request — and the panel has to render
 * it as a sentence either way.
 */

const PING_SCHEMA: JsonSchema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: { ok: { type: "boolean" } },
};

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await requireAdminMembership(session);
  const input = await parseBody(request, verifyCredentialSchema);

  const descriptor = getProvider(input.provider);
  if (!descriptor) {
    throw new ApiError("VALIDATION_FAILED", { fields: { provider: "Unknown provider" } });
  }

  const model = resolveModel(descriptor, input.model);

  // No `onRun` sink: a verification is not a house's LLM run, and logging one
  // would put a row against a credential that may never be saved.
  const provider = createProvider({
    descriptor,
    apiKey: input.api_key,
    model,
    baseUrl: input.base_url ?? null,
  });

  const result = await provider.complete<{ ok: boolean }>({
    purpose: "nl_parse",
    system: "Reply with JSON only.",
    user: 'Reply with exactly {"ok":true}',
    schema: PING_SCHEMA,
    maxTokens: 32,
    temperature: 0,
  });

  if (result.ok) {
    return jsonResponse({ ok: true, latency_ms: result.latencyMs, model_echo: model });
  }

  const error = result.error ?? "";
  const rejected = /\b401\b|\b403\b|unauthor|invalid.*key|api key/i.test(error);

  return jsonResponse({
    ok: false,
    error: rejected ? "PROVIDER_REJECTED_KEY" : "PROVIDER_UNREACHABLE",
    // The provider's own words, truncated by the transport. It never contains
    // the key: the key is only ever a request header.
    detail: error,
    latency_ms: result.latencyMs,
  });
});
