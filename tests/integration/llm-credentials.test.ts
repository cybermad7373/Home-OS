import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { keyLast4, sealKey, toPgBytea } from "@/lib/infra/llm/crypto";

config({ path: ".env.local", quiet: true });

/**
 * The credential rows of section 10 of docs/10-LLM-SPEC.md, run rather than
 * asserted:
 *
 *   "An authenticated member selecting from `house_llm_credentials` gets zero
 *    rows; the same member reading `house_llm_config` gets the row without
 *    ciphertext."
 *   "A non-admin member calling `set_house_llm_credential` is refused by the
 *    database."
 *
 * These are properties of Postgres — a policy that does not exist and a
 * `security definer` function that checks a role — so a database is the only
 * place they can be proved.
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
 * Migration 045 may not be applied to whatever this run is pointed at. That is
 * a state of the environment, not a failure of the code, so the suite skips
 * rather than reporting a defect it cannot distinguish from a missing `db push`.
 */
const migrated = configured
  ? await admin
      .from("house_llm_credentials")
      .select("house_id")
      .limit(1)
      // Any error at all means the relation is not there to be tested: a
      // missing table is `42P01` from Postgres and `PGRST205` from PostgREST's
      // schema cache, and neither is a defect in this repository.
      .then(({ error }) => !error)
  : false;

const describeIfReady = configured && migrated ? describe : describe.skip;

const PASSWORD = "test-password-1";
const MASTER_KEY = "PmJ8CFzVV5FtEmLn7rpgJRKOIdOEWxMb+wcvLEfvsr8=";
const stamp = Date.now();

interface Actor {
  userId: string;
  client: SupabaseClient;
  memberId: string;
}

describeIfReady("house LLM credentials", () => {
  let houseId: string;
  let adminActor: Actor;
  let plainMember: Actor;

  async function signUp(label: string): Promise<{ userId: string; client: SupabaseClient }> {
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
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw signInError;

    return { userId: created.user!.id, client };
  }

  beforeAll(async () => {
    process.env.LLM_KEY_ENCRYPTION_KEY = MASTER_KEY;

    const first = await signUp("llm-admin");
    const { data: house, error } = await first.client.rpc("create_house", {
      p_name: `LLM House ${stamp}`,
      p_address: null,
      p_timezone: "Asia/Kolkata",
      p_currency: "INR",
    });
    if (error) throw error;
    houseId = (house as { house_id: string }[])[0].house_id;

    const { data: adminMember } = await first.client
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .single();

    adminActor = { ...first, memberId: (adminMember as { id: string }).id };

    // A second, ordinary member of the same house.
    const second = await signUp("llm-member");
    const { data: joined } = await admin
      .from("house_members")
      .insert({
        house_id: houseId,
        user_id: second.userId,
        role: "member",
        status: "active",
      })
      .select("id")
      .single();

    plainMember = { ...second, memberId: (joined as { id: string }).id };
  }, 60_000);

  afterAll(async () => {
    if (!configured || !migrated) return;
    await admin.from("house_llm_credentials").delete().eq("house_id", houseId);
    await admin.from("llm_runs").delete().eq("house_id", houseId);
    await admin.from("house_members").delete().eq("house_id", houseId);
    await admin.from("houses").delete().eq("id", houseId);
    for (const actor of [adminActor, plainMember]) {
      if (actor) await admin.auth.admin.deleteUser(actor.userId);
    }
  }, 60_000);

  async function storeAs(actor: Actor, key: string) {
    const sealed = await sealKey(key, houseId);
    return actor.client.rpc("set_house_llm_credential", {
      p_house_id: houseId,
      p_provider: "groq",
      p_model: "llama-3.3-70b-versatile",
      p_base_url: null,
      p_key_ciphertext: toPgBytea(sealed.ciphertext),
      p_key_iv: toPgBytea(sealed.iv),
      p_key_tag: toPgBytea(sealed.tag),
      p_key_last4: keyLast4(key),
      p_key_version: sealed.version,
      p_status: "active",
      p_verified_at: new Date().toISOString(),
    });
  }

  it("lets an admin store a key", async () => {
    const { error } = await storeAs(adminActor, "gsk_the_house_own_provider_key");
    expect(error).toBeNull();
  });

  it("refuses a non-admin, in the database rather than in the route", async () => {
    const { error } = await storeAs(plainMember, "gsk_someone_elses_key");
    expect(error?.message ?? "").toContain("ADMIN_REQUIRED");
  });

  it("gives every member zero rows from the credential table itself", async () => {
    for (const actor of [adminActor, plainMember]) {
      const { data, error } = await actor.client.from("house_llm_credentials").select("*");
      // Either a policy-free table returns nothing, or PostgREST refuses the
      // relation outright. Both are the same guarantee.
      expect(data ?? [], "no ciphertext reaches a browser").toHaveLength(0);
      if (error) expect(["42501", "PGRST301", "PGRST106"]).toContain(error.code);
    }
  });

  it("gives a member the view, with the last four characters and no key", async () => {
    const { data, error } = await plainMember.client
      .from("house_llm_config")
      .select("*")
      .eq("house_id", houseId)
      .single();

    expect(error).toBeNull();
    expect(data?.provider).toBe("groq");
    expect(data?.key_last4).toBe("_key");
    expect(Object.keys(data ?? {})).not.toContain("key_ciphertext");
    expect(JSON.stringify(data)).not.toContain("gsk_the_house_own_provider_key");
  });

  it("stores ciphertext, not the key", async () => {
    const { data } = await admin
      .from("house_llm_credentials")
      .select("key_ciphertext")
      .eq("house_id", houseId)
      .single();

    expect(String(data?.key_ciphertext)).not.toContain("gsk_");
  });

  // -------------------------------------------------------------------------
  // The capability switches — AI-02, docs/10-LLM-SPEC.md section 3.6a
  // -------------------------------------------------------------------------

  it("starts with all six call sites on", async () => {
    const { data } = await adminActor.client
      .from("house_llm_config")
      .select("capabilities")
      .eq("house_id", houseId)
      .single();

    const capabilities = (data as { capabilities: Record<string, boolean> }).capabilities;
    expect(Object.keys(capabilities).sort()).toEqual([
      "food_ideas",
      "food_normalise",
      "natural_language",
      "rule_parsing",
      "schedule_proposals",
      "weekly_summary",
    ]);
    expect(Object.values(capabilities).every(Boolean)).toBe(true);
  });

  it("merges a switch rather than replacing the object", async () => {
    const { data, error } = await adminActor.client.rpc("set_llm_capabilities", {
      p_house_id: houseId,
      p_capabilities: { rule_parsing: false },
    });

    expect(error).toBeNull();
    const capabilities = data as Record<string, boolean>;
    expect(capabilities.rule_parsing).toBe(false);
    // The other five are untouched. Switching one off never affects another.
    expect(capabilities.food_ideas).toBe(true);
    expect(capabilities.weekly_summary).toBe(true);
  });

  it("refuses a non-admin, and refuses a key that is not a call site", async () => {
    const refused = await plainMember.client.rpc("set_llm_capabilities", {
      p_house_id: houseId,
      p_capabilities: { rule_parsing: true },
    });
    expect(refused.error?.message ?? "").toContain("ADMIN_REQUIRED");

    const typo = await adminActor.client.rpc("set_llm_capabilities", {
      p_house_id: houseId,
      p_capabilities: { rule_parseing: false },
    });
    expect(typo.error?.message ?? "").toContain("capabilities_well_formed");

    const notBoolean = await adminActor.client.rpc("set_llm_capabilities", {
      p_house_id: houseId,
      p_capabilities: { rule_parsing: "off" },
    });
    expect(notBoolean.error?.message ?? "").toContain("capabilities_well_formed");
  });

  it("lets an admin remove it, and a non-admin not", async () => {
    const refused = await plainMember.client.rpc("delete_house_llm_credential", {
      p_house_id: houseId,
    });
    expect(refused.error?.message ?? "").toContain("ADMIN_REQUIRED");

    const removed = await adminActor.client.rpc("delete_house_llm_credential", {
      p_house_id: houseId,
    });
    expect(removed.error).toBeNull();

    const { data } = await admin
      .from("house_llm_credentials")
      .select("house_id")
      .eq("house_id", houseId);
    expect(data ?? []).toHaveLength(0);
  });
});
