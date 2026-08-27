import "server-only";

import { cookies } from "next/headers";

/**
 * The caller's selected Home.
 *
 * docs/05-API-SPEC.md section 1: the Home context is "derived from the caller's
 * selected Home, held server-side in the session, never taken from a request
 * body. A request cannot name a Home it does not belong to."
 *
 * The selection is kept in an httpOnly cookie, which is the same place the
 * Supabase session lives. That is deliberate, and it is not the same thing as
 * taking the Home from the request: the value read here is a *hint*, and
 * `resolveSelectedMembership` in `lib/data/house.ts` resolves it against the
 * caller's active memberships before anything uses it. A cookie naming a Home
 * the caller does not belong to resolves to their default Home, not to an
 * error and not to that Home's data.
 *
 * Nothing else in the app may read the cookie. Every route and every server
 * component goes through `getMembership`, which is the single accessor section
 * 2.3 of the implementation plan asks for — which is why the 67 handlers that
 * shipped before Homes existed needed no edit to become Home-aware.
 */

const COOKIE = "houseos.home";

/** A year. Selecting a Home is a preference, not a credential. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function readSelectedHouseId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value?.trim();
  return value ? value : null;
}

/**
 * Only ever called from a route handler — Next refuses a cookie write during a
 * server-component render, and a render is exactly where a silent re-stamp
 * would hide a bug.
 */
export async function writeSelectedHouseId(houseId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, houseId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSelectedHouse(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
