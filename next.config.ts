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
 * There is deliberately **no `Content-Security-Policy` yet**. Next injects
 * inline bootstrap script and the app uses inline styles, so a correct policy
 * needs per-request nonces threaded through the proxy — worth doing, and worth
 * doing as its own change with its own testing rather than bundled into a
 * headers pass that must not break the product. Until then these are the
 * headers that carry no such risk.
 */
const securityHeaders = [
  // Clickjacking. `frame-ancestors` is the modern control and `X-Frame-Options`
  // is kept for the browsers that only understand that one.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

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
