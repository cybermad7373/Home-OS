import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { requireServiceRoleKey, supabaseUrl } from "./env";

/**
 * The service-role client bypasses RLS entirely. It exists for scheduled jobs
 * and for the few administrative operations that have no caller session.
 *
 * SEC-02 — never import this from a client component. The `server-only` import
 * above turns that mistake into a build error rather than a leaked key.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), requireServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
