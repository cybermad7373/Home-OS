import "server-only";

import { createAdminClient } from "@/lib/infra/supabase/admin";
import { ApiError } from "@/lib/api/errors";

/**
 * Username resolution.
 *
 * Supabase Auth knows emails, not usernames, so signing in with a username is a
 * two-step move: resolve the name to an email, then hand the pair to Auth. The
 * resolution runs here, on the server, with the service-role key — never in the
 * browser and never as a database function the browser may call. Anything that
 * answers "which email owns this username" from the client is an enumeration
 * tool pointed at your own house.
 */

/** Never leaks which account exists: caller sees only a resolved email or null. */
export async function emailForUsername(username: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("email")
    .ilike("username", escapeLike(username))
    .maybeSingle();

  if (error) throw new ApiError("INTERNAL", { cause: error.message });
  return data?.email ?? null;
}

/** True when the name is free. Says nothing about who holds it when taken. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id")
    .ilike("username", escapeLike(username))
    .maybeSingle();

  if (error) throw new ApiError("INTERNAL", { cause: error.message });
  return data === null;
}

/** Resolves whichever identifier the person typed into the email Auth needs. */
export async function resolveIdentifier(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return emailForUsername(trimmed);
}

/**
 * `ilike` is a LIKE match, so `%`, `_` and `\` in the value are wildcards and
 * escapes rather than literal characters — and `_` is legal in every username.
 * Without escaping, `ruth_1` also matches `ruthx1`, and a name that matches two
 * rows turns `maybeSingle` into an error. Escape to an exact case-insensitive
 * match; the unique index on `lower(username)` guarantees at most one row.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
