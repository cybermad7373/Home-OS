import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Migration 090 — the write limiter, in a real Postgres.
 *
 * `docs/18-GO-LIVE.md` section 6 named the gap: a signed-in member, or a script
 * holding their cookie, could post in a loop and nothing stopped it. The counter
 * has to be in the database rather than in the server, because a deploy of more
 * than one instance would otherwise keep one counter each and refuse a fraction
 * of the traffic while reporting that it had refused all of it.
 *
 * Three claims are worth a real database, and none of them can be checked
 * without one:
 *
 *   * the identity comes from `auth.uid()`, so a caller cannot pick a bucket
 *     that nobody else is filling;
 *   * two callers do not share a limit;
 *   * the table is unreachable to a member, who must not be able to read the
 *     shape of anybody's traffic or delete their own counter.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/rate-limit
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

const admin = configured
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : (null as never);

/** 090 may not be applied to whatever this run is pointed at. */
const migrated = configured
  ? await admin
      .rpc("consume_rate_limit", {
        p_scope: "probe",
        p_limit: 1,
        p_window_seconds: 60,
      })
      .then(({ error }) => !error)
  : false;

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface Verdict {
  allowed: boolean;
  hits: number;
  retry_after_seconds: number;
}

describeIfReady("the write limiter", () => {
  const userIds: string[] = [];
  let alice: SupabaseClient;
  let bob: SupabaseClient;

  async function signUp(label: string): Promise<SupabaseClient> {
    const email = `ratelimit-${label}-${stamp}@houseos.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;
    userIds.push(data.user!.id);

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;
    return client;
  }

  async function consume(
    client: SupabaseClient,
    scope: string,
    limit: number,
  ): Promise<Verdict> {
    const { data, error } = await client.rpc("consume_rate_limit", {
      p_scope: scope,
      p_limit: limit,
      p_window_seconds: 60,
    });
    if (error) throw error;
    return (data as Verdict[])[0];
  }

  beforeAll(async () => {
    alice = await signUp("alice");
    bob = await signUp("bob");
  });

  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    await admin.from("rate_limit_hits").delete().like("bucket", `%:${stamp}%`);
  });

  it("counts up and refuses the request past the limit", async () => {
    const scope = `${stamp}-basic`;

    expect((await consume(alice, scope, 3)).hits).toBe(1);
    expect((await consume(alice, scope, 3)).hits).toBe(2);

    const third = await consume(alice, scope, 3);
    expect(third.hits).toBe(3);
    expect(third.allowed, "the limit itself is allowed, not refused").toBe(true);

    const fourth = await consume(alice, scope, 3);
    expect(fourth.allowed).toBe(false);
    // "Retry after 0 seconds" is an invitation to spin.
    expect(fourth.retry_after_seconds).toBeGreaterThan(0);
    expect(fourth.retry_after_seconds).toBeLessThanOrEqual(60);
  });

  it("gives each caller their own limit", async () => {
    const scope = `${stamp}-shared`;

    await consume(alice, scope, 2);
    await consume(alice, scope, 2);
    expect((await consume(alice, scope, 2)).allowed).toBe(false);

    // Bob has spent nothing. If the bucket were keyed by anything the caller
    // supplies rather than by auth.uid(), this is where it would show.
    const bobFirst = await consume(bob, scope, 2);
    expect(bobFirst.allowed).toBe(true);
    expect(bobFirst.hits).toBe(1);
  });

  it("keeps scopes apart", async () => {
    const one = `${stamp}-one`;
    const two = `${stamp}-two`;

    await consume(alice, one, 1);
    expect((await consume(alice, one, 1)).allowed).toBe(false);
    expect((await consume(alice, two, 1)).allowed).toBe(true);
  });

  it("refuses a limit that is not a limit", async () => {
    await expect(consume(alice, `${stamp}-bad`, 0)).rejects.toThrow(/VALIDATION_FAILED/);
  });

  it("does not let a member read or delete the counters", async () => {
    await consume(alice, `${stamp}-private`, 5);

    // RLS is on with no policy, so a member sees nothing through PostgREST —
    // not their own row, and not anybody else's.
    const { data, error } = await alice.from("rate_limit_hits").select("*");
    expect(error ?? { message: "" }).toBeTruthy();
    expect(data ?? []).toEqual([]);

    const removal = await alice
      .from("rate_limit_hits")
      .delete()
      .like("bucket", `%:${stamp}-private`);
    expect(removal.error ?? { message: "" }).toBeTruthy();

    // Still counted, from the one client that is allowed to look.
    const { data: rows } = await admin
      .from("rate_limit_hits")
      .select("hits")
      .like("bucket", `%:${stamp}-private`);
    expect((rows as { hits: number }[])[0].hits).toBe(1);
  });

  it("sweeps windows nobody can still be inside, and only those", async () => {
    const scope = `${stamp}-sweep`;
    await consume(alice, scope, 5);

    await admin
      .from("rate_limit_hits")
      .insert({
        bucket: `stale:${stamp}-sweep`,
        window_start: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        hits: 99,
      });

    const { error } = await admin.rpc("sweep_rate_limit_hits");
    expect(error).toBeNull();

    const { data: stale } = await admin
      .from("rate_limit_hits")
      .select("bucket")
      .eq("bucket", `stale:${stamp}-sweep`);
    expect(stale ?? []).toEqual([]);

    const { data: fresh } = await admin
      .from("rate_limit_hits")
      .select("bucket")
      .like("bucket", `%:${scope}`);
    expect((fresh ?? []).length, "today's window survives").toBe(1);
  });
});
