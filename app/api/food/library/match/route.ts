import { z } from "zod";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { aiMatchFood, matchFood } from "@/lib/data/food";

const matchSchema = z.object({
  name: z.string().trim().min(1),
  /**
   * Which half is being asked for. They are two answers with very different
   * costs, and the caller asks for them separately for the same reason Try
   * Today does: the deterministic half must come back at typing speed, and the
   * model half may route to a provider.
   */
  half: z.enum(["deterministic", "ai"]).default("deterministic"),
});

/**
 * POST /api/food/library/match — the did-you-mean panel (section 4.1).
 *
 * Runs before anything is written. Deterministic by default: exact match on the
 * normalised form wins outright, otherwise the closest three within a
 * length-scaled edit distance are offered. Never merges on its own — the
 * caller decides (FD-10).
 *
 * `half: "ai"` is call site 6, and is only worth asking once the deterministic
 * half has come back with nothing. It returns one entry the Home already has,
 * or null, and it is a suggestion somebody confirms rather than a merge.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const body = await parseBody(request, matchSchema);

  if (body.half === "ai") {
    return jsonResponse({ aiSuggestion: await aiMatchFood(session, house.id, body.name) });
  }

  return jsonResponse(await matchFood(session, house.id, body.name));
});
