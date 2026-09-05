import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/infra/supabase/env";

/**
 * What a crawler may look at, which is almost nothing.
 *
 * Every screen behind the login is a household's ledger — what people spent,
 * who owes whom, who did the washing up — and `app/(app)/layout.tsx` already
 * marks the whole shell `noindex`. This file is the same statement made before
 * a crawler asks for the page rather than after, and it is the one that
 * crawlers which never render a page will actually obey.
 *
 * Four things are public and meant to be found: the two ways in, and the two
 * documents a person reads before they make an account. `/join/<token>` is
 * public and deliberately absent — the token is the secret, and a link that
 * names a real household has no business in a search index.
 */
export default function robots(): MetadataRoute.Robots {
  const base = appUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/signin", "/signup", "/legal/privacy", "/legal/terms", "/legal/support"],
        disallow: [
          "/",
          "/api/",
          "/join/",
          "/home",
          "/homes",
          "/today",
          "/chores",
          "/expenses",
          "/money",
          "/food",
          "/house",
          "/insights",
          "/settle",
          "/notifications",
          "/more",
          "/admin",
          "/onboarding",
          "/dev/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
