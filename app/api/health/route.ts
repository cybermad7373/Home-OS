import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/infra/supabase/admin";
import { logWarning } from "@/lib/infra/http/log";

/**
 * GET /api/health — is this deployment answering, and can it reach its database.
 *
 * `docs/18-GO-LIVE.md` section 6 left monitoring undecided. This is the half of
 * the answer an external checker needs: a URL that returns 200 when the app can
 * serve a request and 503 when it cannot, so an uptime service alerts on the
 * status code rather than on a string somebody has to configure.
 *
 * **It is public, and it says nothing.** An uptime checker has no session, so
 * this route is in the proxy's public list — which means anybody can call it,
 * which means it must not answer a single question about the household data
 * behind it. No counts, no names, no version of anything that would help
 * somebody pick an exploit. Two booleans and a timestamp.
 *
 * **The database check is cached for ten seconds.** The query runs as the
 * service role, and a public endpoint that starts a privileged query per
 * request is an amplifier: one HTTP request in, one database round trip out, at
 * whatever rate somebody feels like. Ten seconds is under every uptime
 * service's polling interval, so a real checker sees a real result every time
 * and a flood sees a cached one.
 *
 * The revision is included when the host sets it, because "is the deploy the
 * one I pushed" is the second question after "is it up" — and it is a git sha,
 * which says nothing about anybody.
 */

interface Cached {
  ok: boolean;
  at: number;
}

const CACHE_MS = 10_000;
let cached: Cached | null = null;

async function databaseReachable(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ok;

  let ok = false;
  try {
    const admin = createAdminClient();
    // The cheapest question with a definite answer: a count, no rows, on a
    // table that exists in every environment and holds no household data.
    // `*` rather than a named column deliberately — a health check that has to
    // be edited when a column is renamed is a health check that will one day
    // report an outage that is not happening.
    const { error } = await admin
      .from("notification_types")
      .select("*", { head: true, count: "exact" });
    ok = !error;
    if (error) {
      logWarning({ code: "HEALTH_DB_UNREACHABLE", route: "/api/health", message: error.message });
    }
  } catch (error) {
    logWarning({
      code: "HEALTH_DB_UNREACHABLE",
      route: "/api/health",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  cached = { ok, at: Date.now() };
  return ok;
}

export async function GET(): Promise<NextResponse> {
  const database = await databaseReachable();

  return NextResponse.json(
    {
      status: database ? "ok" : "degraded",
      database,
      revision: process.env.APP_REVISION ?? null,
      time: new Date().toISOString(),
    },
    {
      // 503 so an uptime service alerts without being told what to read.
      status: database ? 200 : 503,
      // Never a cached answer from a CDN: the whole point is the state right now.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
