import "server-only";

/**
 * How much a signed-in member may write, and how often.
 *
 * The counter itself is a row in Postgres — see migration 090 for why it is
 * there and not in this process. This module is the policy: which requests are
 * counted, what the limit is, and what a refusal looks like.
 *
 * **Only writes, and only the API.** A GET is a read of the caller's own
 * household through RLS; refusing one costs a person their screen and buys
 * nothing. A page navigation is not counted for the same reason, and because a
 * person holding down F5 is not the failure this exists for. What is counted is
 * `POST`, `PATCH`, `PUT` and `DELETE` under `/api/`, which is every way this
 * product changes anything.
 *
 * **The numbers.** 120 writes a minute is roughly two a second sustained, which
 * no person produces and no screen in this app needs: the busiest thing anybody
 * does by hand is record a week of chores. A loop crosses it in under a second.
 * Both are environment variables because the right number depends on the
 * deployment, and a household of four is not a demo of forty.
 */

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Reads an integer environment variable, falling back rather than throwing. */
function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function writeLimit(): { limit: number; windowSeconds: number } {
  return {
    limit: envInt("RATE_LIMIT_WRITES", 120),
    windowSeconds: envInt("RATE_LIMIT_WINDOW_SECONDS", 60),
  };
}

export function isCountedWrite(method: string, pathname: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase()) && pathname.startsWith("/api/");
}

/** The scope passed to `consume_rate_limit`. One class today; named, not implied. */
export const WRITE_SCOPE = "write";
