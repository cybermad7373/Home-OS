import Script from "next/script";

/**
 * Analytics, on the public pages only, and off unless somebody turns it on.
 *
 * The launch gate asks for analytics. The obvious way to satisfy it — drop a
 * tag in the root layout — would be a defect in this product: every URL behind
 * the login carries household context, and a page view sent from
 * `/more/approvals/<decision id>` hands a third party the shape of a
 * household's private argument. `SEC` in AGENTS.md is explicit that household
 * data does not leave the deployment, and a page-view beacon is household data
 * wearing a different hat.
 *
 * So this renders on the four public pages and nowhere else: sign in, sign up,
 * and the three documents. Those are the pages where "did anybody arrive" is a
 * question worth answering, and none of them names a household.
 *
 * It is also cookieless by construction. `NEXT_PUBLIC_ANALYTICS_SRC` is
 * expected to be a script-only, no-cookie counter — Plausible, Umami, Fathom,
 * a self-hosted equivalent — and the `data-domain` attribute is what those
 * scripts read. Nothing here sets a cookie, which is why the cookie notice can
 * honestly say there are two of them and both are necessary. Point this at a
 * tag that sets cookies and that sentence stops being true; use a real consent
 * gate instead.
 *
 * Unset, it renders nothing at all. A self-hosted household measures nobody.
 */
export function Analytics() {
  const src = process.env.NEXT_PUBLIC_ANALYTICS_SRC;
  const domain = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN;

  if (!src) return null;

  return (
    <Script
      src={src}
      data-domain={domain}
      // `afterInteractive`: a counter is never on the critical path of a
      // sign-in form, and a counter that delays one is worse than no counter.
      strategy="afterInteractive"
      defer
    />
  );
}
