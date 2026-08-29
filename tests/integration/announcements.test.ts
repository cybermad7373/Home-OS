import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Phase 14 — house announcements, in a real Postgres (BR-260, BR-261).
 *
 * The route handler refuses a member with `requireLeadMembership`. That is the
 * courteous refusal; this suite covers the one that actually holds — the
 * policies and constraints in migration 089, asked of a real member's own
 * authenticated client:
 *
 *   * an ordinary member cannot post one (BR-260);
 *   * a lead cannot post one under somebody else's name;
 *   * everybody in the Home reads them, and nobody outside it does;
 *   * an announcement must have an end, and it must be in the future (BR-261);
 *   * severity is one of three values and nothing else;
 *   * taking one down is a lead's privilege too.
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/announcements
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

let migrated = false;
if (configured) {
  const { error } = await admin.from("house_announcements").select("id").limit(1);
  migrated = !error;
}

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

interface Actor {
  userId: string;
  memberId: string;
  client: SupabaseClient;
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

describeIfReady("house announcements", () => {
  let lead: Actor;
  let member: Actor;
  let outsider: Actor;

  let houseId: string;
  const houseIds: string[] = [];
  const userIds: string[] = [];

  async function signUp(label: string): Promise<Omit<Actor, "memberId">> {
    const email = `announce-${label}-${stamp}@houseos.test`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label },
    });
    if (error) throw error;
    userIds.push(created.user!.id);

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;

    return { userId: created.user!.id, client };
  }

  async function memberIdOf(house: string, userId: string): Promise<string> {
    const { data, error } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", house)
      .eq("user_id", userId)
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async function join(actor: Omit<Actor, "memberId">, house: string): Promise<string> {
    const { data: invite } = await admin
      .from("invitations")
      .select("token")
      .eq("house_id", house)
      .is("revoked_at", null)
      .single();

    await actor.client.rpc("request_join", {
      p_token: (invite as { token: string }).token,
      p_message: null,
    });

    const { data: request } = await admin
      .from("join_requests")
      .select("id")
      .eq("house_id", house)
      .eq("user_id", actor.userId)
      .eq("status", "requested")
      .single();

    await lead.client.rpc("accept_join_request", {
      p_request_id: (request as { id: string }).id,
    });

    return memberIdOf(house, actor.userId);
  }

  beforeAll(async () => {
    const leadBase = await signUp("lead");
    const { data, error } = await leadBase.client.rpc("create_house", {
      p_name: `Announce ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (data as { house_id: string }[])[0].house_id;
    houseIds.push(houseId);
    lead = { ...leadBase, memberId: await memberIdOf(houseId, leadBase.userId) };

    const memberBase = await signUp("member");
    member = { ...memberBase, memberId: await join(memberBase, houseId) };

    // A member of a different Home entirely, for the isolation case.
    const outsiderBase = await signUp("outsider");
    const { data: otherHouse, error: otherError } = await outsiderBase.client.rpc("create_house", {
      p_name: `Elsewhere ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (otherError) throw otherError;
    const otherHouseId = (otherHouse as { house_id: string }[])[0].house_id;
    houseIds.push(otherHouseId);
    outsider = {
      ...outsiderBase,
      memberId: await memberIdOf(otherHouseId, outsiderBase.userId),
    };
  }, 120_000);

  afterAll(async () => {
    if (!configured) return;
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  // -------------------------------------------------------------------------
  // BR-260 — who may write one
  // -------------------------------------------------------------------------

  it("lets a lead post one", async () => {
    const { data, error } = await lead.client
      .from("house_announcements")
      .insert({
        house_id: houseId,
        author_member_id: lead.memberId,
        title: "Maintenance tomorrow",
        body: "Water is off from 10 AM.",
        severity: "important",
        expires_at: hoursFromNow(24),
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("refuses an ordinary member", async () => {
    const { error } = await member.client.from("house_announcements").insert({
      house_id: houseId,
      author_member_id: member.memberId,
      title: "Party on Friday",
      body: "Everybody welcome.",
      expires_at: hoursFromNow(24),
    });

    expect(error).not.toBeNull();
  });

  it("refuses a lead posting under somebody else's name", async () => {
    const { error } = await lead.client.from("house_announcements").insert({
      house_id: houseId,
      author_member_id: member.memberId,
      title: "Not mine",
      body: "Signed by somebody who did not write it.",
      expires_at: hoursFromNow(24),
    });

    expect(error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // BR-261 — it always has an end
  // -------------------------------------------------------------------------

  it("refuses one that expires in the past", async () => {
    const { error } = await lead.client.from("house_announcements").insert({
      house_id: houseId,
      author_member_id: lead.memberId,
      title: "Already over",
      body: "Expired before it was written.",
      expires_at: hoursFromNow(-1),
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("announcement_expires_in_the_future");
  });

  it("refuses a severity outside the three", async () => {
    const { error } = await lead.client.from("house_announcements").insert({
      house_id: houseId,
      author_member_id: lead.memberId,
      title: "Loud",
      body: "Severity that does not exist.",
      severity: "catastrophic",
      expires_at: hoursFromNow(24),
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("announcement_severity_known");
  });

  it("refuses a blank title", async () => {
    const { error } = await lead.client.from("house_announcements").insert({
      house_id: houseId,
      author_member_id: lead.memberId,
      title: "   ",
      body: "No title at all.",
      expires_at: hoursFromNow(24),
    });

    expect(error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Who reads them
  // -------------------------------------------------------------------------

  it("shows them to every member of the Home", async () => {
    const { data, error } = await member.client
      .from("house_announcements")
      .select("id, title")
      .eq("house_id", houseId);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("shows them to nobody outside the Home", async () => {
    const { data, error } = await outsider.client
      .from("house_announcements")
      .select("id")
      .eq("house_id", houseId);

    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Expiry hides rather than deletes
  // -------------------------------------------------------------------------

  it("keeps an expired one on the record while the live read passes over it", async () => {
    const { data: inserted, error: insertError } = await lead.client
      .from("house_announcements")
      .insert({
        house_id: houseId,
        author_member_id: lead.memberId,
        title: "Short notice",
        body: "Water is off for the next hour.",
        expires_at: hoursFromNow(1),
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    const id = (inserted as { id: string }).id;

    // The live read asked as of two hours from now — the same `gt` the
    // repository's `listLiveAnnouncements` makes, with its `now` moved forward
    // rather than the row's expiry moved back. Moving the expiry back is not
    // possible: `announcement_expires_in_the_future` holds on update as well as
    // on insert, so an announcement's end cannot be back-dated. Taking one down
    // early is a delete, which is the case below.
    const live = await member.client
      .from("house_announcements")
      .select("id")
      .eq("house_id", houseId)
      .gt("expires_at", hoursFromNow(2));
    expect((live.data ?? []).map((row) => (row as { id: string }).id)).not.toContain(id);

    const all = await member.client
      .from("house_announcements")
      .select("id")
      .eq("house_id", houseId);
    expect((all.data ?? []).map((row) => (row as { id: string }).id)).toContain(id);
  });

  it("refuses to back-date an expiry — an announcement ends by expiring or by being taken down", async () => {
    const { data: inserted, error: insertError } = await lead.client
      .from("house_announcements")
      .insert({
        house_id: houseId,
        author_member_id: lead.memberId,
        title: "Standing notice",
        body: "Bins go out on Tuesday.",
        expires_at: hoursFromNow(48),
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const { error } = await lead.client
      .from("house_announcements")
      .update({ expires_at: hoursFromNow(-1) })
      .eq("id", (inserted as { id: string }).id);

    expect(error).not.toBeNull();
    expect(error?.message).toContain("announcement_expires_in_the_future");
  });

  // -------------------------------------------------------------------------
  // Taking one down
  // -------------------------------------------------------------------------

  it("refuses a member taking one down, and admits a lead", async () => {
    const { data: inserted, error: insertError } = await lead.client
      .from("house_announcements")
      .insert({
        house_id: houseId,
        author_member_id: lead.memberId,
        title: "Posted by mistake",
        body: "To be removed.",
        expires_at: hoursFromNow(24),
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    const id = (inserted as { id: string }).id;

    await member.client.from("house_announcements").delete().eq("id", id);
    const afterMember = await admin
      .from("house_announcements")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    expect(afterMember.data).not.toBeNull();

    await lead.client.from("house_announcements").delete().eq("id", id);
    const afterLead = await admin
      .from("house_announcements")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    expect(afterLead.data).toBeNull();
  });
});
