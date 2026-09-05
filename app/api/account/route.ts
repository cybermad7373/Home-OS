import { jsonResponse, route } from "@/lib/api/handler";
import { eraseOwnAccount, erasureBlockers } from "@/lib/data/account";
import { requireSession } from "@/lib/data/house";

/**
 * GET /api/account — what stands between this account and being erased.
 *
 * Asked before the screen offers the button, so that a person who cannot
 * delete their account is told why by the screen rather than by a refusal
 * after they have typed their username to confirm.
 */
export const GET = route(async () => {
  const session = await requireSession();
  const blockers = await erasureBlockers(session);

  return jsonResponse({
    can_erase: blockers.length === 0,
    homes: blockers.map((blocker) => ({
      id: blocker.house_id,
      name: blocker.house_name,
      role: blocker.role,
    })),
  });
});

/**
 * DELETE /api/account — erase the person, keep the household's arithmetic.
 *
 * What this does and does not do is settled in D-90 and in migration 091: the
 * name, username, email, phone, payment address and avatar go; the
 * `house_members` rows the ledger references stay, showing "Former member"
 * where a name used to be. An expense somebody paid is not theirs to withdraw
 * — other people have settled balances against it.
 *
 * It refuses with `409 ACCOUNT_IN_USE` while any membership is active, and the
 * refusal names the Homes. Leaving one is a decision that Home makes; this is
 * not a second door out of it.
 *
 * The caller's session is not revoked here. The account is banned and its
 * password scrambled, so nothing can sign in again; the client signs out on
 * the response, which is the difference between "you are signed out" and a
 * screen that dies mid-render.
 */
export const DELETE = route(async () => {
  const session = await requireSession();
  const result = await eraseOwnAccount(session);

  return jsonResponse({
    erased: true,
    memberships_kept: result.memberships,
    already_erased: result.already_erased,
  });
});
