import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireAdminMembership, requireSession } from "@/lib/data/house";
import { setCapabilities } from "@/lib/data/llm";
import { capabilitiesSchema } from "@/lib/validation/ai";

/**
 * PUT /api/ai/capabilities — the six switches under the key (AI-02).
 *
 * An Admin's, and Important rather than Critical: switching off a suggestion
 * nobody has to take does not need the Home's acknowledgement, which is why
 * this is an endpoint and not a decision type. What a switch cannot do is give
 * a model authority it did not have — every call site has a deterministic
 * branch, so every switch only ever removes prose.
 *
 * The body is merged with what is stored rather than replacing it, so a panel
 * written before a seventh call site existed turns six switches rather than
 * silently disabling the one it has never heard of.
 */
export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireAdminMembership(session);
  const body = await parseBody(request, capabilitiesSchema);

  return jsonResponse({ capabilities: await setCapabilities(session, house.id, body) });
});
