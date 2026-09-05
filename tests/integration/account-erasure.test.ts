import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Migration 091 — erasing an account without erasing the ledger.
 *
 * The claim being tested is the one the privacy page now makes: a person's
 * details go, and the household's arithmetic stays. Both halves need a real
 * database. The first because "gone" means gone from the row, and the second
 * because what keeps the ledger intact is a foreign key — `expenses`,
 * `expense_splits` and `settlements` reference `house_members(id)` with no
 * cascade — and a foreign key cannot be unit tested.
 *
 * It also tests the refusal, which is the part somebody will be tempted to
 * remove: an active member cannot erase themselves out of a Home, because
 * leaving one is a decision that Home makes (D-45).
 *
 * It creates and deletes real users. Point it at a local stack or a scratch
 * project, never at production.
 *
 *   npm run test -- tests/integration/account-erasure
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

/** 091 may not be applied to whatever this run is pointed at. */
const migrated = configured
  ? await admin
      .from("account_erasures")
      .select("user_id")
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

describeIfReady("erasing an account", () => {
  const userIds: string[] = [];
  const houseIds: string[] = [];

  async function signUp(label: string, username: string): Promise<Actor> {
    const email = `erase-${label}-${stamp}@houseos.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: label, username },
    });
    if (error) throw error;
    userIds.push(data.user!.id);

    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw signInError;

    return { userId: data.user!.id, email, client };
  }

  async function makeHome(actor: Actor, name: string): Promise<string> {
    const { data, error } = await actor.client.rpc("create_house", {
      p_name: name,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    const id = (data as { house_id: string }[])[0].house_id;
    houseIds.push(id);
    return id;
  }

  async function memberIdOf(houseId: string, userId: string): Promise<string> {
    const { data, error } = await admin
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .eq("user_id", userId)
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  afterAll(async () => {
    for (const id of houseIds) await admin.from("houses").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("refuses while the caller is an active member of a Home", async () => {
    const actor = await signUp("member", `erasemem${stamp}`.slice(0, 20));
    await makeHome(actor, `Erase Home ${stamp}`);

    const { error } = await admin.rpc("erase_account", { p_user_id: actor.userId });
    expect(error?.message ?? "").toContain("ACCOUNT_IN_USE");

    // And says which Home, from the caller's own client, so a screen can name it.
    const { data: blockers, error: blockerError } = await actor.client.rpc(
      "account_erasure_blockers",
    );
    expect(blockerError).toBeNull();
    expect((blockers as { house_name: string }[]).map((row) => row.house_name)).toEqual([
      `Erase Home ${stamp}`,
    ]);
  });

  it("erases the person and frees the name and the address", async () => {
    const username = `erasesolo${stamp}`.slice(0, 20);
    const actor = await signUp("solo", username);

    await admin
      .from("users")
      .update({ phone: "+919876543210", upi_vpa: "someone@upi", avatar_url: "https://x/y.png" })
      .eq("id", actor.userId);

    const { data, error } = await admin.rpc("erase_account", { p_user_id: actor.userId });
    expect(error).toBeNull();
    expect((data as { already_erased: boolean }[])[0].already_erased).toBe(false);

    const { data: row } = await admin
      .from("users")
      .select("display_name, username, email, phone, upi_vpa, avatar_url")
      .eq("id", actor.userId)
      .single();

    const erased = row as Record<string, unknown>;
    expect(erased.display_name).toBe("Former member");
    expect(erased.username).toBeNull();
    expect(erased.phone).toBeNull();
    expect(erased.upi_vpa).toBeNull();
    expect(erased.avatar_url).toBeNull();
    // On the reserved TLD from RFC 2606: an address that could be delivered to
    // is not erased.
    expect(String(erased.email)).toMatch(/@erased\.invalid$/);
    expect(String(erased.email)).not.toContain("houseos.test");

    // The proof it happened, carrying nothing personal of its own.
    const { data: audit } = await admin
      .from("account_erasures")
      .select("user_id, memberships")
      .eq("user_id", actor.userId)
      .single();
    expect(audit).toBeTruthy();
  });

  it("is idempotent, because the route may have to retry", async () => {
    const actor = await signUp("twice", `erasetwice${stamp}`.slice(0, 20));

    await admin.rpc("erase_account", { p_user_id: actor.userId });
    const { data, error } = await admin.rpc("erase_account", { p_user_id: actor.userId });

    expect(error).toBeNull();
    expect((data as { already_erased: boolean }[])[0].already_erased).toBe(true);
  });

  it("keeps the ledger, under a name nobody recognises", async () => {
    // A Home with a leaver in it: the member record and everything the ledger
    // hangs off it must survive an erasure.
    const owner = await signUp("owner", `eraseown${stamp}`.slice(0, 20));
    const leaver = await signUp("leaver", `eraselvr${stamp}`.slice(0, 20));
    // A third person, because the property the governance version exists to
    // protect is that no single member's responses complete a Critical
    // decision — so the proposer cannot also be the only approver.
    const other = await signUp("other", `eraseoth${stamp}`.slice(0, 20));
    const houseId = await makeHome(owner, `Ledger Home ${stamp}`);

    const { error: memberError } = await admin
      .from("house_members")
      .insert([
        { house_id: houseId, user_id: leaver.userId, role: "member", status: "active" },
        { house_id: houseId, user_id: other.userId, role: "member", status: "active" },
      ]);
    if (memberError) throw memberError;
    const memberId = await memberIdOf(houseId, leaver.userId);

    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .limit(1)
      .single();

    // Through the RPC the app uses, so the expense has the period, the splits
    // and the approval state a real one has.
    const today = new Date().toISOString().slice(0, 10);
    const { error: expenseError } = await leaver.client.rpc("create_expense", {
      p_house_id: houseId,
      p_category_id: (category as { id: string }).id,
      p_amount_paise: 25000,
      p_expense_date: today,
      p_split_basis: "equal",
      p_splits: [{ member_id: memberId, share_paise: 25000, guest_share_paise: 0 }],
      p_description: "Rice and dal",
      p_paid_by_member_id: memberId,
    });
    if (expenseError) throw expenseError;

    // They leave the Home, which is the Home's decision — modelled here by the
    // end state that decision produces.
    /*
      They leave, and leaving is a decision the Home makes — the database says
      so, and it said so when this test tried to shortcut it: an admin writing
      `status = 'inactive'` straight at the column is refused with
      DECISION_REQUIRED, and a service-role key is refused too, because it
      bypasses RLS and not a trigger (D-06). So the decision is seeded and
      applied the way `membership.test.ts` does it, which is also the way the
      product does it.
    */
    const ownerMemberId = await memberIdOf(houseId, owner.userId);

    const { data: decision, error: decisionError } = await admin
      .from("decisions")
      .insert({
        house_id: houseId,
        type: "remove_member",
        level: "critical",
        requested_by: ownerMemberId,
        subject_member_id: memberId,
        subject_type: "house_member",
        reason: "They moved out at the end of the month",
        // Two, because the floor under this whole version is that a Critical
        // decision needs two distinct people to have spoken.
        required_approvals: 2,
      })
      .select("id")
      .single();
    if (decisionError) throw decisionError;
    const decisionId = (decision as { id: string }).id;

    const otherMemberId = await memberIdOf(houseId, other.userId);
    const approvers = [ownerMemberId, otherMemberId];

    await admin.from("decision_participants").insert(
      approvers.map((member_id) => ({ decision_id: decisionId, member_id, capacity: "approver" })),
    );
    await admin.from("decision_responses").insert(
      approvers.map((member_id) => ({
        decision_id: decisionId,
        member_id,
        capacity: "approver",
        response: "approve",
      })),
    );

    // The resolver is what moves a decision off `waiting`; nothing in an insert
    // does it, deliberately, because the status has to be right even when the
    // response arrives from something that is not this application.
    const { error: resolveError } = await admin.rpc("resolve_decision", {
      p_decision_id: decisionId,
    });
    if (resolveError) throw resolveError;

    const { error: applyError } = await admin.rpc("apply_decision", {
      p_decision_id: decisionId,
    });
    if (applyError) throw applyError;

    const { error } = await admin.rpc("erase_account", { p_user_id: leaver.userId });
    expect(error).toBeNull();

    // The membership row is still there, and so is the expense pointing at it.
    const { data: member } = await admin
      .from("house_members")
      .select("id, status")
      .eq("id", memberId)
      .single();
    expect((member as { status: string }).status).toBe("inactive");

    const { data: expense } = await admin
      .from("expenses")
      .select("amount_paise, paid_by_member_id")
      .eq("paid_by_member_id", memberId)
      .single();
    expect((expense as { amount_paise: number }).amount_paise).toBe(25000);

    // And the name it now reads under is nobody's.
    const { data: profile } = await admin
      .from("users")
      .select("display_name")
      .eq("id", leaver.userId)
      .single();
    expect((profile as { display_name: string }).display_name).toBe("Former member");
  });

  it("is not callable by a member, only by the server", async () => {
    const actor = await signUp("nosy", `erasenosy${stamp}`.slice(0, 20));

    const { error } = await actor.client.rpc("erase_account", { p_user_id: actor.userId });
    // Erasure runs alongside auth changes the browser cannot make, so half of
    // it being reachable from a tab is the one thing that must not be true.
    expect(error).toBeTruthy();
  });
});
