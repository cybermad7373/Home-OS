import { ApiError } from "@/lib/api/errors";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import {
  requireActiveMembership,
  requireAdminMembership,
  requireSession,
} from "@/lib/data/house";
import { deleteCredential, getLlmConfig, storeCredential } from "@/lib/data/llm";
import { resetBreakerForHouse } from "@/lib/infra/llm/breaker";
import { keyLast4, sealKey, sealingAvailable } from "@/lib/infra/llm/crypto";
import { getProvider, resolveBaseUrl, resolveModel } from "@/lib/infra/llm/providers";
import { putCredentialSchema } from "@/lib/validation/ai";

/**
 * The house's AI credential — docs/05-API-SPEC.md section 10.
 *
 * `GET` reads the `house_llm_config` view, so it cannot return a key even if it
 * tried: the view has no ciphertext column. `PUT` seals the key before it
 * reaches the database, and `DELETE` returns the house to its deterministic
 * paths with nothing else changed.
 */

export const GET = route(async () => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  return jsonResponse(await getLlmConfig(session, house.id));
});

export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const input = await parseBody(request, putCredentialSchema);

  const descriptor = getProvider(input.provider);
  if (!descriptor) throw new ApiError("VALIDATION_FAILED", { fields: { provider: "Unknown provider" } });

  const baseUrl = resolveBaseUrl(descriptor, input.base_url);
  if (descriptor.requiresBaseUrl && !baseUrl) {
    throw new ApiError("VALIDATION_FAILED", {
      fields: { base_url: "A self-hosted provider needs its URL" },
    });
  }

  // Never a plaintext fallback. A server with no master key refuses the write
  // and says why — spec section 3.3.
  if (!sealingAvailable()) throw new ApiError("LLM_SEALING_UNAVAILABLE");

  const sealed = await sealKey(input.api_key, house.id);

  await storeCredential(session, house.id, {
    provider: input.provider,
    model: resolveModel(descriptor, input.model),
    baseUrl: descriptor.requiresBaseUrl ? baseUrl : null,
    sealed,
    keyLast4: keyLast4(input.api_key),
    // `active` only when this same key answered a verify call; otherwise the
    // admin saved without checking and the first real call decides.
    status: input.verified ? "active" : "unverified",
    verifiedAt: input.verified ? new Date().toISOString() : null,
  });

  // A new key means the old breaker state is stale. Reset so the replacement
  // works immediately rather than waiting up to an hour for the cooldown.
  resetBreakerForHouse(house.id);

  return jsonResponse(await getLlmConfig(session, house.id));
});

export const DELETE = route(async () => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  await deleteCredential(session, house.id);
  resetBreakerForHouse(house.id);
  return jsonResponse({ configured: false });
});
