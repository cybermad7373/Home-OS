import "server-only";

/**
 * The Content-Security-Policy, built per request.
 *
 * Until now the app sent `frame-ancestors 'none'` and nothing else, and
 * `next.config.ts` said why: Next injects an inline bootstrap script, so a
 * real policy needs a per-request nonce threaded through the proxy, and that
 * was worth doing as its own change rather than inside a headers pass. This is
 * that change. `docs/18-GO-LIVE.md` section 6 listed it as the first gap at
 * go-live.
 *
 * ## What is strict, and what is not
 *
 * **`script-src` is strict, and it is the one that matters.** A nonce plus
 * `'strict-dynamic'` means a script tag executes only if this request minted
 * its nonce, or if a script that did loaded it. An injected `<script>` — the
 * XSS this product would actually meet, through a member's own name, a note on
 * an expense, a rule's text — cannot guess the nonce and does not run.
 *
 * **`style-src` allows `'unsafe-inline'`, deliberately.** Three things in this
 * app write styles the browser sees as inline: server-rendered `style`
 * attributes (a progress bar's width, an avatar's pixel size), `motion/react`,
 * which appends a `<style>` element of its own during a layout animation, and
 * GSAP. A nonce cannot cover a `style` attribute at all — CSP3 governs those
 * with `style-src-attr`, which takes no nonce — and a nonce on `style-src`
 * *disables* `'unsafe-inline'` for the elements, which would break the
 * animation libraries. The honest reading: CSS injection is a far weaker
 * primitive than script injection, and pretending otherwise here would mean
 * shipping a policy that had to be relaxed the first time somebody opened a
 * sheet.
 *
 * ## The origins
 *
 * The browser talks to Supabase directly — `supabase-js` signs in, refreshes a
 * token and opens a realtime socket from the page — so its origin is in
 * `connect-src` under both schemes. Receipts and avatars are signed storage
 * URLs on that same origin, hence `img-src`.
 *
 * `upgrade-insecure-requests` is production-only: on a development machine
 * served over plain http it would upgrade every request to a port that is not
 * listening.
 */

export interface CspOptions {
  nonce: string;
  /** Development needs `'unsafe-eval'`: React uses `eval` to rebuild server stacks. */
  dev: boolean;
  /** `NEXT_PUBLIC_SUPABASE_URL`, or nothing if it is unset. */
  supabaseUrl?: string;
  /** `NEXT_PUBLIC_ANALYTICS_SRC`, or nothing if analytics is off. */
  analyticsSrc?: string;
}

/** The origin of a URL, or nothing if it is not one. A bad value is dropped. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** `https://x.supabase.co` → `wss://x.supabase.co`, for the realtime socket. */
function websocketOrigin(origin: string): string {
  return origin.replace(/^http/, "ws");
}

export function contentSecurityPolicy({
  nonce,
  dev,
  supabaseUrl,
  analyticsSrc,
}: CspOptions): string {
  const supabase = originOf(supabaseUrl);
  const analytics = originOf(analyticsSrc);

  const connect = ["'self'", supabase, supabase ? websocketOrigin(supabase) : null, analytics];
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    dev ? "'unsafe-eval'" : null,
  ];

  const directives: [string, (string | null)[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", script],
    // See the note above: inline styles are how this app draws, and a nonce
    // here would break the elements rather than protect them.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", supabase]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connect],
    ["media-src", ["'self'", "blob:", supabase]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    // Nothing in this product embeds anything, and nothing may embed it.
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];

  const policy = directives
    .map(([name, values]) => `${name} ${values.filter(Boolean).join(" ")}`)
    .join("; ");

  return dev ? policy : `${policy}; upgrade-insecure-requests`;
}

/**
 * A fresh, unguessable nonce per request. `crypto.randomUUID` is available on
 * the Edge runtime the proxy runs on; `Buffer` is not, so this is base64 by
 * hand rather than `Buffer.from(...).toString("base64")`.
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Report-only exists for the shakedown: a deploy can watch the console for a
 * week before a policy starts refusing things. It is off unless asked for, so
 * the default is enforcement — a policy nobody switched on is not a policy.
 */
export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}
