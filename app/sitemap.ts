import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/infra/supabase/env";

/**
 * The five pages that exist for somebody who is not signed in.
 *
 * A sitemap for this product is short on purpose. Sixty routes render
 * household data and none of them belong in an index; listing them would be
 * publishing a directory of private ledgers and inviting a crawler to try each
 * one. `/join/<token>` is public and still absent, because the token is the
 * secret.
 *
 * `lastModified` is the deploy, not a per-page date. These pages change when
 * the product does, and inventing a date per page would be a claim this file
 * cannot back up.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const lastModified = new Date();

  return [
    { url: `${base}/signin`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/legal/privacy`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/legal/terms`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/legal/support`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
