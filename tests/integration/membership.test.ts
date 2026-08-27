import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 10 — membership and Homes.
 *
 * The acceptance criteria in docs/07-ROADMAP.md phase 10 that cannot be
 * satisfied by inspection. Every one of them is about the database refusing
 * something, so every one of them needs a real Postgres.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/membership
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

/**
 * Migrations 047-050 may not be applied to whatever this run is pointed at.
 * That is a state of the environment, not a failure of the code, so the suite
 * skips rather than reporting a defect it cannot tell apart from a missing
 * `db push` — the same shape `llm-credentials.test.ts` uses for migration 045.
 */
const migrated = configured
  ? await admin
      .from("invitations")
      .select("id")
      .limit(1)
      .then(({ error }) => !error)
  : false;

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface Actor {
  userId: string;
  email: string;
  client: SupabaseClient;
}

describeIfReady("membership and Homes", () => {

  let owner: Actor;
  let stranger: Actor;
  const houseIds: string[] = [];

  async function makeActor(label: string): Promise<Actor> {
    const email = `${label}-${stamp}@houseos.test`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    return { userId: created.user!.id, email, client };
  }

  async function makeHome(actor: Actor, name: string): Promise<string> {
    const { data, error } = await actor.client.rpc("create_house", {
      p_name: name,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    const houseId = (data as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);
    return houseId;
  }

  async function liveToken(houseId: string): Promise<string> {
    const { data, error } = await admin
      .from("invitations")
      .select("token")
      .eq("house_id", houseId)
      .is("revoked_at", null)
      .single();
    if (error) throw error;
    return (data as { token: string }).token;
  }

  beforeAll(async () => {
    owner = await makeActor("owner");
    stranger = await makeActor("stranger");
  }, 60_000);

  afterAll(async () => {
    if (!configured) return;
    for (const houseId of houseIds) {
      await admin.from("expenses").delete().eq("house_id", houseId);
      await admin.from("houses").delete().eq("id", houseId);
    }
    for (const actor of [owner, stranger]) {
      if (actor) await admin.auth.admin.deleteUser(actor.userId);
    }
  }, 60_000);

  // -------------------------------------------------------------------------
  // HM-20 — a new Home is usable before it is configured
  // -------------------------------------------------------------------------
  it("gives a brand-new Home an admin, categories, chores and a live link", async () => {
    const houseId = await makeHome(owner, `Owner Home ${stamp}`);

    const { data: member } = await admin
      .from("house_members")
      .select("role, status")
      .eq("house_id", houseId)
      .single();
    expect(member).toMatchObject({ role: "admin", status: "active" });

    const { count: categories } = await admin
      .from("expense_categories")
      .select("id", { count: "exact", head: true })
      .eq("house_id", houseId);
    expect(categories ?? 0).toBeGreaterThan(0);

    // HM-20's real content: the seeded workload exists, so the Home can record
    // a week's chores before anybody has written a chore catalogue.
    const { count: templates } = await admin
      .from("chore_templates")
      .select("id", { count: "exact", head: true })
      .eq("house_id", houseId);
    expect(templates ?? 0).toBeGreaterThan(0);

    await expect(liveToken(houseId)).resolves.toMatch(/^[A-Za-z0-9_-]{16,}$/);
  }, 30_000);

  // -------------------------------------------------------------------------
  // The join path, and the fact that it is the only one
  // -------------------------------------------------------------------------
  it("lets a stranger ask, and shows them nothing until somebody accepts", async () => {
    const houseId = await makeHome(owner, `Join Home ${stamp}`);
    const token = await liveToken(houseId);

    // The public preview: a name, a shape, a size. Nothing else.
    const { data: preview, error: previewError } = await stranger.client.rpc(
      "lookup_invitation",
      { p_token: token },
    );
    expect(previewError).toBeNull();
    expect((preview as { house_name: string }[])[0].house_name).toBe(
      `Join Home ${stamp}`,
    );

    const { error: requestError } = await stranger.client.rpc("request_join", {
      p_token: token,
      p_message: "Moving in on the 1st",
    });
    expect(requestError).toBeNull();

    // Asking is not joining. There is no membership row at all yet.
    const { data: members } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .eq("user_id", stranger.userId);
    expect(members).toEqual([]);

    // And the Home is invisible to them, table by table.
    const tables = [
      "house_settings",
      "rooms",
      "house_members",
      "room_assignments",
      "expense_categories",
      "monthly_periods",
      "expenses",
      "expense_splits",
      "recurring_expenses",
      "chore_templates",
      "chore_assignments",
      "effort_ledger",
      "settlements",
      "member_period_balances",
      "guests",
      "member_availability",
      "availability_exceptions",
      "invitations",
      "join_requests",
    ] as const;

    for (const table of tables) {
      const { data, error } = await stranger.client
        .from(table)
        .select("*")
        .eq("house_id", houseId);
      expect(error, `${table} errored`).toBeNull();

      // `join_requests` is the documented exception: the person sees the
      // request they raised themselves, and nothing else about the Home.
      if (table === "join_requests") {
        expect(
          (data ?? []).every(
            (row) => (row as { user_id: string }).user_id === stranger.userId,
          ),
          "join_requests leaked somebody else's request",
        ).toBe(true);
      } else {
        expect(data, `${table} leaked rows`).toEqual([]);
      }
    }
  }, 60_000);

  it("refuses a role on a Requested row, in either direction", async () => {
    const houseId = await makeHome(owner, `Constraint Home ${stamp}`);

    // The service-role key bypasses RLS. It does not bypass a check constraint,
    // which is the whole reason HM-07 is expressed as one.
    const withRole = await admin.from("house_members").insert({
      house_id: houseId,
      user_id: stranger.userId,
      role: "member",
      status: "requested",
    });
    expect(withRole.error?.message ?? "").toContain("requested_has_no_role");

    const withoutRole = await admin.from("house_members").insert({
      house_id: houseId,
      user_id: stranger.userId,
      role: null,
      status: "active",
    });
    expect(withoutRole.error?.message ?? "").toContain("requested_has_no_role");
  }, 30_000);

  it("rotates the link without touching a membership or an open request", async () => {
    const houseId = await makeHome(owner, `Rotate Home ${stamp}`);
    const first = await liveToken(houseId);

    const { error: requestError } = await stranger.client.rpc("request_join", {
      p_token: first,
    });
    expect(requestError).toBeNull();

    const { error: rotateError } = await owner.client.rpc("rotate_invitation", {
      p_house_id: houseId,
    });
    expect(rotateError).toBeNull();

    const second = await liveToken(houseId);
    expect(second).not.toBe(first);

    // The old link is dead the moment the new one exists.
    const { data: stale } = await stranger.client.rpc("lookup_invitation", {
      p_token: first,
    });
    expect(stale ?? []).toEqual([]);

    // The request raised against the old link survives it.
    const { data: open } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", houseId)
      .eq("status", "requested");
    expect(open?.length).toBe(1);

    // As does the Admin's own membership.
    const { count } = await admin
      .from("house_members")
      .select("id", { count: "exact", head: true })
      .eq("house_id", houseId)
      .eq("status", "active");
    expect(count).toBe(1);
  }, 60_000);

  it("accepts a request into an Active member with an ordinary role", async () => {
    const houseId = await makeHome(owner, `Accept Home ${stamp}`);
    const token = await liveToken(houseId);

    await stranger.client.rpc("request_join", { p_token: token });

    const { data: request } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", houseId)
      .eq("status", "requested")
      .single();

    const { error } = await owner.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });
    expect(error).toBeNull();

    const { data: member } = await admin
      .from("house_members")
      .select("role, status")
      .eq("house_id", houseId)
      .eq("user_id", stranger.userId)
      .single();
    expect(member).toMatchObject({ role: "member", status: "active" });
  }, 60_000);

  it("refuses an acceptance from somebody who is not a lead", async () => {
    const houseId = await makeHome(owner, `Authority Home ${stamp}`);
    const token = await liveToken(houseId);
    await stranger.client.rpc("request_join", { p_token: token });

    const { data: request } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", houseId)
      .eq("status", "requested")
      .single();

    // The person asking is the last person who should be able to answer.
    const { error } = await stranger.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });
    expect(error?.message ?? "").toContain("LEAD_REQUIRED");
  }, 60_000);

  // -------------------------------------------------------------------------
  // Several Homes, one person
  // -------------------------------------------------------------------------
  it("keeps a role in one Home from meaning anything in another", async () => {
    const mine = await makeHome(owner, `Mine ${stamp}`);
    const theirs = await makeHome(stranger, `Theirs ${stamp}`);

    // Owner is Admin in `mine`. In `theirs` they are nothing at all, and
    // is_house_lead has to agree.
    const { data: leadHere } = await owner.client.rpc("is_house_lead", {
      p_house_id: mine,
    });
    expect(leadHere).toBe(true);

    const { data: leadThere } = await owner.client.rpc("is_house_lead", {
      p_house_id: theirs,
    });
    expect(leadThere).toBe(false);

    const { data: rooms } = await owner.client
      .from("rooms")
      .select("id")
      .eq("house_id", theirs);
    expect(rooms).toEqual([]);
  }, 60_000);

  // -------------------------------------------------------------------------
  // Removal, and the money that outlives it (D-45)
  // -------------------------------------------------------------------------
  it("completes a clean removal at once", async () => {
    const houseId = await makeHome(owner, `Clean Exit ${stamp}`);
    const token = await liveToken(houseId);
    await stranger.client.rpc("request_join", { p_token: token });

    const { data: request } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", houseId)
      .eq("status", "requested")
      .single();
    await owner.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });

    const { data: member } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .eq("user_id", stranger.userId)
      .single();

    const { error } = await owner.client.rpc("remove_member", {
      p_member_id: (member as { id: string }).id,
    });
    expect(error).toBeNull();

    const { data: after } = await admin
      .from("house_members")
      .select("status, left_date, pending_settlement")
      .eq("id", (member as { id: string }).id)
      .single();

    expect(after).toMatchObject({ status: "inactive", pending_settlement: false });
    expect((after as { left_date: string | null }).left_date).not.toBeNull();
  }, 60_000);

  it("leaves a removal pending while money is outstanding, and finishes it when the last payment is confirmed", async () => {
    const houseId = await makeHome(owner, `Owing Exit ${stamp}`);
    const token = await liveToken(houseId);
    await stranger.client.rpc("request_join", { p_token: token });

    const { data: request } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", houseId)
      .eq("status", "requested")
      .single();
    await owner.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });

    const { data: members } = await admin
      .from("house_members")
      .select("id, user_id")
      .eq("house_id", houseId);
    const leaver = (members as { id: string; user_id: string }[]).find(
      (row) => row.user_id === stranger.userId,
    )!;
    const stayer = (members as { id: string; user_id: string }[]).find(
      (row) => row.user_id === owner.userId,
    )!;

    const { data: period } = await admin
      .from("monthly_periods")
      .insert({ house_id: houseId, period: "2026-08" })
      .select("id")
      .single();

    const { data: settlement } = await admin
      .from("settlements")
      .insert({
        house_id: houseId,
        period_id: (period as { id: string }).id,
        from_member_id: leaver.id,
        to_member_id: stayer.id,
        amount_paise: 50000,
        status: "pending",
      })
      .select("id")
      .single();

    await owner.client.rpc("remove_member", { p_member_id: leaver.id });

    const { data: pending } = await admin
      .from("house_members")
      .select("status, pending_settlement")
      .eq("id", leaver.id)
      .single();
    expect(pending).toMatchObject({ status: "inactive", pending_settlement: true });

    // The settlement is untouched by the removal — they still owe it.
    const { data: stillOwed } = await admin
      .from("settlements")
      .select("status")
      .eq("id", (settlement as { id: string }).id)
      .single();
    expect((stillOwed as { status: string }).status).toBe("pending");

    // The daily job leaves them alone while the money is outstanding.
    await admin.rpc("complete_pending_removals");
    const { data: unchanged } = await admin
      .from("house_members")
      .select("pending_settlement")
      .eq("id", leaver.id)
      .single();
    expect((unchanged as { pending_settlement: boolean }).pending_settlement).toBe(true);

    // Confirmed — and the next run finishes the removal without being asked.
    await admin
      .from("settlements")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", (settlement as { id: string }).id);

    await admin.rpc("complete_pending_removals");

    const { data: done } = await admin
      .from("house_members")
      .select("status, pending_settlement")
      .eq("id", leaver.id)
      .single();
    expect(done).toMatchObject({ status: "inactive", pending_settlement: false });
  }, 90_000);
});
