import { jsonResponse, route } from "@/lib/api/handler";
import { requireSession } from "@/lib/data/house";
import { publicRegistry } from "@/lib/infra/llm/providers";

/**
 * GET /api/ai/providers — the registry, as the picker renders it.
 *
 * Static, and it contains no secrets: ids, labels, model lists, free-tier notes
 * and the console URL where a house mints its own key. A session is required
 * only because nothing in this app answers a stranger.
 */
export const GET = route(async () => {
  await requireSession();
  return jsonResponse({ providers: publicRegistry() });
});
