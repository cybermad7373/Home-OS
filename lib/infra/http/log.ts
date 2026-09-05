import "server-only";

/**
 * Where an application error goes.
 *
 * `docs/18-GO-LIVE.md` section 6 asked the question and left it open: "decide
 * where an application error goes." The answer here is the one that needs no
 * third-party account, no key in the environment and no script in the bundle —
 * **one JSON object per line on stderr**. Every host this could be deployed on
 * collects stdout and stderr, so a structured line is greppable in Vercel's log
 * drain, in `docker logs`, in journald and in a file, and can be shipped to
 * whatever aggregator gets chosen later without any of this changing.
 *
 * ## The rule about what goes in a line
 *
 * **Nothing a household would recognise.** No display name, no email, no house
 * name, no amount, no note, no path segment that is an id of something a person
 * wrote. A log is the one place in this product where data ends up somewhere
 * nobody set an RLS policy on: on a host's disk, in a retention window nobody
 * chose, readable by whoever can read logs. `AGENTS.md` says household data does
 * not leave the deployment, and a log line is a way for it to leave.
 *
 * So a line carries the *shape* of a failure — the route pattern, the method,
 * the error code, the Postgres SQLSTATE, a reference — and never its contents.
 * `route` is the pattern (`/api/expenses/[id]`) rather than the URL, precisely
 * because the URL has the id in it.
 *
 * ## The reference
 *
 * A 500 already tells the person "Something went wrong. It's been logged." The
 * reference is what makes that sentence actionable: it is in the response and
 * in the log line, so somebody reporting a problem can quote eight characters
 * and the line is found. It is random rather than derived, because a hash of
 * the message would be the same for every occurrence and a counter would say
 * how much traffic this deployment gets.
 */

export interface ErrorLine {
  /** The error catalogue code, or `UNCAUGHT` for anything that never reached it. */
  code: string;
  /** The eight characters a person can quote back. */
  reference: string;
  /** The route *pattern*, never the URL: the URL names a household's records. */
  route?: string;
  method?: string;
  status?: number;
  /** Postgres SQLSTATE, when the failure came from the database. */
  sqlstate?: string;
  /**
   * Which half of the app failed — a rendered screen, a route handler, the
   * proxy. Three different investigations, and the framework knows which.
   */
  routeType?: string;
  /**
   * The message. Safe for a database or framework error, which is the only
   * thing this is ever called with — never a request body, and never a value a
   * member typed.
   */
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-\d{2}$/;

/**
 * A URL, reduced to the route it is.
 *
 * `/api/expenses/6f9a…/approve` becomes `/api/expenses/[id]/approve`. The id
 * is which expense, in which household, which is exactly the thing a log line
 * must not carry — and the pattern is the whole of what is useful for finding
 * the defect. The query string goes entirely: it holds member filters and
 * dates.
 */
export function redactPath(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    return "[unparseable]";
  }

  return pathname
    .split("/")
    .map((segment) => {
      if (UUID.test(segment)) return "[id]";
      if (DATE.test(segment)) return "[date]";
      if (PERIOD.test(segment)) return "[period]";
      // A long opaque segment is an invite token or something like one.
      if (segment.length > 24) return "[token]";
      return segment;
    })
    .join("/");
}

/** Eight characters of base32-ish. Short enough to read down a phone. */
export function newReference(): string {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/**
 * One line, on stderr, as JSON.
 *
 * `console.error` rather than a logger dependency: this runs on the Node
 * runtime and on the Edge runtime, and the two agree about `console` and about
 * very little else.
 */
export function logError(line: ErrorLine): void {
  const record = {
    ts: new Date().toISOString(),
    level: "error",
    event: "app.error",
    ...line,
  };

  // A single argument, already serialised: a host that collects lines rather
  // than objects otherwise records "[object Object]".
  console.error(JSON.stringify(record));
}

/**
 * The same shape at warning level, for a failure the app absorbed — a rate
 * limit that could not be reached, an auth server that did not answer. These
 * are the lines that say why something was slower or looser than usual, and
 * they are the ones missing when an incident is being reconstructed.
 */
export function logWarning(line: Omit<ErrorLine, "reference"> & { reference?: string }): void {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "warn",
      event: "app.warning",
      ...line,
    }),
  );
}
