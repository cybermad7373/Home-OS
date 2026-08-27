import { ApiError } from "@/lib/api/errors";
import { jsonResponse, route } from "@/lib/api/handler";
import { requireActiveMembership, requireSession } from "@/lib/data/house";

/**
 * GET /api/receipts?path={house_id}/{file} — a short-lived signed URL.
 *
 * The bucket is private and stays that way. A stored public URL would be a
 * permanent, unauthenticated link to a receipt with a name and an amount on it;
 * this mints one that expires, and only for somebody in the house that owns the
 * path. The storage policy enforces the same rule independently.
 */
const TTL_SECONDS = 300;

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const { house } = await requireActiveMembership(session);

  const path = new URL(request.url).searchParams.get("path");
  if (!path) throw new ApiError("NOT_FOUND");

  // Belt and braces: the path is scoped by house before Storage is asked.
  if (!path.startsWith(`${house.id}/`)) throw new ApiError("NOT_FOUND");

  const { data, error } = await session.supabase.storage
    .from("receipts")
    .createSignedUrl(path, TTL_SECONDS);

  if (error || !data) throw new ApiError("NOT_FOUND");
  return jsonResponse({ url: data.signedUrl, expires_in: TTL_SECONDS });
});
