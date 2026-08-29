import { z } from "zod";
import { jsonResponse, parseBody, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";
import { matchFood } from "@/lib/data/food";

const matchSchema = z.object({ name: z.string().trim().min(1) });

/**
 * POST /api/food/library/match — the did-you-mean panel (section 4.1).
 *
 * Runs before anything is written. Deterministic: exact match on the
 * normalised form wins outright, otherwise the closest three within a
 * length-scaled edit distance are offered. Never merges on its own — the
 * caller decides (FD-10).
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);
  const body = await parseBody(request, matchSchema);

  return jsonResponse(await matchFood(session, house.id, body.name));
});
