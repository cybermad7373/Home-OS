import "server-only";

/**
 * How much a signed-in member may write, and how often.
 *
 * The numbers are `docs/05-API-SPEC.md` section 15, which has always specified
 * them and never had anything enforcing them. The counter itself is a row in
 * Postgres — migration 090 says why it is there and not in this process. This
 * module is the policy: which requests are counted, in which bucket, and
 * against which ceiling.
 *
 * **These are abuse ceilings, not product tiers** (NFR-18, BR-290, CM-1). Every
 * number below is sized so that a real member doing ordinary household
 * recording never reaches it: thirty expenses an hour and thirty meals a day
 * are far above any household's real rate. A member who hits one during
 * ordinary use has found a defect in the sizing, to be raised and corrected —
 * not a boundary to be sold past.
 *
 * **Only writes, and only the API.** A GET is a read of the caller's own
 * household through RLS; refusing one costs a person their screen and buys
 * nothing. The spec's own table is about the endpoints that change things, and
 * it exempts the export routes and `GET /api/position` explicitly.
 *
 * **What is not here.** Section 15's per-*Home* limits — rule parsing, food
 * ideas, credential verification, schedule generation, and the second half of
 * the join-request limit — are not enforced from the proxy, and deliberately.
 * The Home a request belongs to is a hint in a cookie until
 * `resolveSelectedMembership` checks it against the caller's memberships, and a
 * bucket keyed on an unchecked hint is a bucket one member can fill on another
 * Home's behalf. Those caps live where the Home is known: `lib/infra/llm/rate.ts`
 * for the AI ones, in memory, which the LLM specification settled as a spend
 * guard rather than a correctness one.
 */

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

const HOUR = 3600;
const DAY = 86_400;

export interface RateRule {
  /** The bucket name. Distinct scopes never share a counter. */
  scope: string;
  limit: number;
  windowSeconds: number;
}

interface PathRule extends RateRule {
  method: string;
  pattern: RegExp;
}

/**
 * `docs/05-API-SPEC.md` section 15, in order, first match wins.
 *
 * One row differs from the table and it is the table that is out of date: the
 * approve-all endpoint is `/api/decisions/approve-all`, not
 * `/api/approvals/approve-all`. The limit is the specified one.
 */
const RULES: PathRule[] = [
  { method: "POST", pattern: /^\/api\/expenses\/?$/, scope: "expenses", limit: 30, windowSeconds: HOUR },
  {
    method: "POST",
    pattern: /^\/api\/chores\/[^/]+\/(confirm|reject)\/?$/,
    scope: "chore-response",
    limit: 60,
    windowSeconds: HOUR,
  },
  { method: "POST", pattern: /^\/api\/food\/meals\/?$/, scope: "meals", limit: 30, windowSeconds: DAY },
  {
    method: "POST",
    pattern: /^\/api\/decisions\/approve-all\/?$/,
    scope: "approve-all",
    limit: 20,
    windowSeconds: HOUR,
  },
  {
    method: "POST",
    pattern: /^\/api\/decisions\/[^/]+\/respond\/?$/,
    scope: "decision-response",
    limit: 100,
    windowSeconds: HOUR,
  },
  { method: "POST", pattern: /^\/api\/decisions\/?$/, scope: "decisions", limit: 20, windowSeconds: DAY },
  {
    method: "POST",
    pattern: /^\/api\/join\/[^/]+\/request\/?$/,
    scope: "join-request",
    limit: 5,
    windowSeconds: HOUR,
  },
  { method: "POST", pattern: /^\/api\/ai\/parse\/?$/, scope: "ai-parse", limit: 20, windowSeconds: DAY },
];

/** Reads an integer environment variable, falling back rather than throwing. */
function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** "Everything else": 300 per member per hour, and configurable per deployment. */
export function defaultRule(): RateRule {
  return {
    scope: "write",
    limit: envInt("RATE_LIMIT_WRITES", 300),
    windowSeconds: envInt("RATE_LIMIT_WINDOW_SECONDS", HOUR),
  };
}

/**
 * The ceiling this request counts against, or nothing if it does not count.
 *
 * A trailing slash is tolerated in every pattern because a limit that a
 * trailing slash walks past is not a limit.
 */
export function ruleFor(method: string, pathname: string): RateRule | null {
  const verb = method.toUpperCase();
  if (!WRITE_METHODS.has(verb)) return null;
  if (!pathname.startsWith("/api/")) return null;

  const matched = RULES.find((rule) => rule.method === verb && rule.pattern.test(pathname));
  if (!matched) return defaultRule();

  // The ceiling, without the matcher that found it: what goes to the counter is
  // a scope and two numbers, and a `RegExp` riding along in the same object is
  // how one ends up in a log line.
  return { scope: matched.scope, limit: matched.limit, windowSeconds: matched.windowSeconds };
}
