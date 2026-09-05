import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/infra/supabase/admin";
import { logWarning } from "@/lib/infra/http/log";
import type { Session } from "./house";

/**
 * Erasing an account.
 *
 * Two halves that have to happen together and cannot be one transaction,
 * because one of them is in Postgres and the other is in Supabase Auth:
 *
 *   1. **Auth**, so sign-in becomes impossible and the address is freed. The
 *      account is banned and its email scrambled to the same tombstone the
 *      profile gets. Reversible, which is the whole reason it goes first.
 *   2. **The profile**, in `erase_account` (migration 091), which anonymises
 *      the person and keeps every `house_members` row the ledger points at.
 *
 * If the second fails the first is undone, so a failure leaves the account
 * exactly as it was rather than locked out of data it can still see. The other
 * order has no such recovery: an anonymised profile whose owner can still sign
 * in is a state nothing can put right without a support request.
 */

export interface ErasureBlocker {
  house_id: string;
  house_name: string;
  role: string;
}

/** The Homes that still count the caller as active, and so stand in the way. */
export async function erasureBlockers(session: Session): Promise<ErasureBlocker[]> {
  const { data, error } = await session.supabase.rpc("account_erasure_blockers");
  if (error) throw apiErrorFromPostgres(error);
  return (data ?? []) as ErasureBlocker[];
}

export interface ErasureResult {
  memberships: number;
  already_erased: boolean;
}

const TOMBSTONE_DOMAIN = "erased.invalid";

/** A password nobody holds, for an account nobody may sign into. */
function unusablePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function eraseOwnAccount(session: Session): Promise<ErasureResult> {
  const blockers = await erasureBlockers(session);
  if (blockers.length > 0) {
    // Named, because "leave your Homes first" is useless advice if the person
    // cannot see which ones.
    throw new ApiError("ACCOUNT_IN_USE", {
      homes: blockers.map((blocker) => ({ id: blocker.house_id, name: blocker.house_name })),
    });
  }

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(
    session.userId,
  );
  if (lookupError || !existing?.user) throw new ApiError("NOT_FOUND");
  const previousEmail = existing.user.email ?? null;

  // A hundred years. Supabase has no permanent ban, and a ban that expires is
  // not what this is; the scrambled password and address are what actually
  // close the door, and the ban is what closes it now rather than at the next
  // token refresh.
  const { error: banError } = await admin.auth.admin.updateUserById(session.userId, {
    email: `erased-${session.userId}@${TOMBSTONE_DOMAIN}`,
    password: unusablePassword(),
    ban_duration: "876000h",
    user_metadata: {},
  });
  if (banError) throw new ApiError("INTERNAL", { cause: banError.message });

  const { data, error } = await admin.rpc("erase_account", { p_user_id: session.userId });

  if (error) {
    /*
      Put the account back exactly as it was. The person pressed a button and
      nothing happened, which is a far better outcome than an account that
      cannot sign in and still holds everything it held before.
    */
    const { error: restoreError } = await admin.auth.admin.updateUserById(session.userId, {
      ...(previousEmail ? { email: previousEmail } : {}),
      ban_duration: "none",
    });
    if (restoreError) {
      // The one state a person cannot get out of on their own, so it is the one
      // that has to be findable in a log.
      logWarning({
        code: "ERASURE_ROLLBACK_FAILED",
        route: "/api/account",
        message: restoreError.message,
      });
    }
    throw apiErrorFromPostgres(error);
  }

  const result = (data as ErasureResult[] | null)?.[0];
  return result ?? { memberships: 0, already_erased: false };
}
