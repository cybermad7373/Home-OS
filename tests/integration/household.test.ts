import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * The two household shapes, against a real database.
 *
 * The arithmetic is proved by property test in tests/unit/household.test.ts.
 * What this suite proves is what cannot be faked in memory: that the schema, the
 * constraints, the RPCs and the grants agree with it. Specifically —
 *
 *   - a family home starts in pot mode with the penalty off, and with a family's
 *     categories rather than a flat's
 *   - a dependent can exist with no login, and the table refuses the ones that
 *     make no sense
 *   - the three-column sum trigger holds when a guardian carries a child's share
 *   - a guardian may mark their dependent's chore done, and may not confirm it
 *
 * It creates and deletes real users. Point it at a scratch project.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);
const describeIfConfigured = configured ? describe : describe.skip;

const PASSWORD = "test-password-1";
const stamp = Date.now();

describeIfConfigured("a family home", () => {
  const admin = configured
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : (null as never);

  let appa: SupabaseClient;
  let amma: SupabaseClient;
  let houseId: string;
  let appaMemberId: string;
  let ammaMemberId: string;
  let childMemberId: string;
  const userIds: string[] = [];

  async function makeUser(prefix: string) {
    const email = `${prefix}-${stamp}@houseos.dev`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: prefix },
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

    userIds.push(data.user!.id);
    return { id: data.user!.id, client };
  }

  beforeAll(async () => {
    const first = await makeUser("fam-appa");
    const second = await makeUser("fam-amma");
    appa = first.client;
    amma = second.client;

    const { data: house, error } = await appa.rpc("create_house", {
      p_name: `Menon House ${stamp}`,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
      p_type: "family",
    });
    if (error) throw error;
    houseId = (house as { house_id: string }[])[0].house_id;

    await admin.from("house_members").insert({
      house_id: houseId,
      user_id: second.id,
      role: "admin",
      status: "active",
    });

    const { data: members } = await admin
      .from("house_members")
      .select("id, user_id")
      .eq("house_id", houseId);

    const rows = members as { id: string; user_id: string | null }[];
    appaMemberId = rows.find((row) => row.user_id === first.id)!.id;
    ammaMemberId = rows.find((row) => row.user_id === second.id)!.id;
  }, 120_000);

  afterAll(async () => {
    if (!configured || !houseId) return;
    await admin.from("expenses").delete().eq("house_id", houseId);
    await admin.from("houses").delete().eq("id", houseId);
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 180_000);

  it("starts in pot mode with the penalty switched off", async () => {
    const { data } = await admin
      .from("house_settings")
      .select("money_mode, effort_mode, penalty_enabled")
      .eq("house_id", houseId)
      .single();

    expect(data).toMatchObject({
      money_mode: "pot",
      effort_mode: "points",
      penalty_enabled: false,
    });
  });

  it("seeds a family's categories, not a flat's", async () => {
    const { data } = await admin
      .from("expense_categories")
      .select("name")
      .eq("house_id", houseId);

    const names = (data ?? []).map((row) => row.name);
    expect(names).toContain("School fees");
    expect(names).toContain("Electricity");
    // A flat gets "Maid"; a family gets the gentler wording.
    expect(names).not.toContain("Maid");
  });

  it("still seeds chore templates — the regression D-19 records", async () => {
    const { count } = await admin
      .from("chore_templates")
      .select("id", { count: "exact", head: true })
      .eq("house_id", houseId);

    expect(count).toBeGreaterThan(0);
  });

  it("adds a child with no login, billed to a parent", async () => {
    const { data, error } = await appa.rpc("add_dependent", {
      p_house_id: houseId,
      p_name: "Meera",
      p_guardian_id: ammaMemberId,
      p_shares_cost: false,
      p_does_chores: true,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as {
      id: string;
      user_id: string | null;
      member_kind: string;
      display_name: string | null;
      guardian_member_id: string | null;
    };

    childMemberId = row.id;
    expect(row.user_id).toBeNull();
    expect(row.member_kind).toBe("dependent");
    expect(row.display_name).toBe("Meera");
    expect(row.guardian_member_id).toBe(ammaMemberId);
  });

  it("refuses a non-paying dependent with nobody to carry them", async () => {
    const { error } = await admin.from("house_members").insert({
      house_id: houseId,
      user_id: null,
      member_kind: "dependent",
      display_name: "Nobody's child",
      shares_cost: false,
      guardian_member_id: null,
      status: "active",
    });

    expect(error).not.toBeNull();
  });

  it("refuses an adult with no login", async () => {
    const { error } = await admin.from("house_members").insert({
      house_id: houseId,
      user_id: null,
      member_kind: "adult",
      display_name: "Ghost",
      status: "active",
    });

    expect(error).not.toBeNull();
  });

  it("lets only an admin add a dependent", async () => {
    const outsider = await makeUser("fam-outsider");
    const { error } = await outsider.client.rpc("add_dependent", {
      p_house_id: houseId,
      p_name: "Not theirs",
      p_guardian_id: ammaMemberId,
    });

    expect(error).not.toBeNull();
  });

  it("accepts a three-column split that sums to the amount", async () => {
    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .eq("name", "Groceries")
      .single();

    // Three heads at ₹1,400: two parents, and Meera on Amma's row.
    const expenseId = await appa.rpc("create_expense", {
      p_category_id: (category as { id: string }).id,
      p_amount_paise: 420000,
      p_expense_date: new Date().toISOString().slice(0, 10),
      p_split_basis: "equal",
      p_splits: [
        { member_id: appaMemberId, share_paise: 140000 },
        {
          member_id: ammaMemberId,
          share_paise: 140000,
          dependent_share_paise: 140000,
        },
      ],
    });

    expect(expenseId.error).toBeNull();

    const { data: splits } = await admin
      .from("expense_splits")
      .select("share_paise, guest_share_paise, dependent_share_paise")
      .eq("expense_id", expenseId.data as unknown as string);

    const total = (splits ?? []).reduce(
      (sum, row) =>
        sum + row.share_paise + row.guest_share_paise + row.dependent_share_paise,
      0,
    );
    expect(total).toBe(420000);
  });

  it("refuses a split that does not sum, three columns and all", async () => {
    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .eq("name", "Groceries")
      .single();

    const { error } = await appa.rpc("create_expense", {
      p_category_id: (category as { id: string }).id,
      p_amount_paise: 420000,
      p_expense_date: new Date().toISOString().slice(0, 10),
      p_split_basis: "equal",
      p_splits: [
        { member_id: appaMemberId, share_paise: 140000 },
        // Meera's head is missing: ₹1,400 short.
        { member_id: ammaMemberId, share_paise: 140000 },
      ],
    });

    expect(error).not.toBeNull();
  });

  it("records a pot-mode expense wholly against its payer", async () => {
    const { data: category } = await admin
      .from("expense_categories")
      .select("id")
      .eq("house_id", houseId)
      .eq("name", "Electricity")
      .single();

    const { data: expenseId, error } = await appa.rpc("create_expense", {
      p_category_id: (category as { id: string }).id,
      p_amount_paise: 312500,
      p_expense_date: new Date().toISOString().slice(0, 10),
      p_split_basis: "payer",
      p_splits: [{ member_id: appaMemberId, share_paise: 312500 }],
    });
    if (error) throw error;

    const { data: splits } = await admin
      .from("expense_splits")
      .select("member_id, share_paise")
      .eq("expense_id", expenseId as unknown as string);

    // One row, the whole amount, on the payer. Paid equals fair share, so the
    // month nets to nothing.
    expect(splits).toHaveLength(1);
    expect(splits![0]).toMatchObject({
      member_id: appaMemberId,
      share_paise: 312500,
    });
  });

  describe("a child's chore", () => {
    let assignmentId: string;

    beforeAll(async () => {
      const { data: template } = await admin
        .from("chore_templates")
        .select("id")
        .eq("house_id", houseId)
        .limit(1)
        .single();

      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await admin
        .from("chore_assignments")
        .insert({
          house_id: houseId,
          template_id: (template as { id: string }).id,
          assignee_member_id: childMemberId,
          chore_date: today,
          slot: "any",
          window_start: `${today}T06:00:00+05:30`,
          window_end: `${today}T22:00:00+05:30`,
          deadline: `${today}T22:00:00+05:30`,
          effort_points: 15,
          duration_min: 15,
          status: "assigned",
          source: "admin",
        })
        .select("id")
        .single();
      if (error) throw error;
      assignmentId = (data as { id: string }).id;
    }, 60_000);

    it("cannot be marked done by somebody who is not their guardian", async () => {
      const { error } = await appa.rpc("mark_chore_done", {
        p_assignment_id: assignmentId,
      });
      expect(error).not.toBeNull();
    });

    it("can be marked done by their guardian (D-24)", async () => {
      const { data, error } = await amma.rpc("mark_chore_done", {
        p_assignment_id: assignmentId,
      });
      expect(error).toBeNull();
      expect(data).toBe("done_pending");
    });

    it("cannot then be confirmed by that same guardian", async () => {
      // Otherwise a parent marks and confirms in two taps, and peer
      // confirmation means nothing for any work routed through a child.
      const { error } = await amma.rpc("confirm_chore", {
        p_assignment_id: assignmentId,
      });
      expect(error).not.toBeNull();
    });

    it("is confirmed by the other parent, and the points post", async () => {
      const { data, error } = await appa.rpc("confirm_chore", {
        p_assignment_id: assignmentId,
      });
      expect(error).toBeNull();
      expect(data).toBe("confirmed");
    });
  });
});
