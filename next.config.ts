import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The app served none. For a product whose every screen is a household's money
 * and whose session is a cookie, three of these are not hardening but
 * correctness: without `frame-ancestors` any site can frame the app and
 * click-jack a signed-in member through an approval; without `nosniff` a
 * stored receipt can be coaxed into executing as script; and without a
 * referrer policy the full URL of a household screen travels to every outbound
 * link.
 *
 * `Strict-Transport-Security` is set here rather than left to the host so that
 * it holds wherever this is deployed. It is harmless on localhost, which is
 * exempt from HSTS in every browser.
 *
 * The `Content-Security-Policy` is **not** here. It carries a per-request
 * nonce, so it is minted in the proxy and set on the response there; a static
 * copy in this file would be a second, weaker header the browser would enforce
 * alongside it. `lib/infra/http/csp.ts` holds the policy and the reasoning.
 */
const securityHeaders = [
  // Clickjacking. `frame-ancestors` is in the policy the proxy sets, and this
  // is kept for the browsers that only understand this one. It also covers the
  // handful of asset paths the proxy does not match.
  { key: "X-Frame-Options", value: "DENY" },

  // A receipt uploaded as `image/png` is never executed as something else.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // The origin, never the path. A household screen's URL says which home and
  // which record; an outbound link does not need either.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Nothing in the app uses these, and saying so stops an embedded third party
  // asking on its behalf.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },

  // Two years, subdomains included. Only ever sent over HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every route, including the API and the service worker.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
