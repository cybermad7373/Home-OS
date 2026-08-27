import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import type { Session } from "@/lib/data/house";
import { createAdminClient } from "@/lib/infra/supabase/admin";
import { fromPgBytea, toPgBytea, type SealedKey } from "@/lib/infra/llm/crypto";
import type { LlmRunRecord } from "@/lib/infra/llm/adapter";
import { top3Share, type DigestInput, type DigestMember } from "@/lib/domain/llm/digest";

/**
 * The credential repository — docs/10-LLM-SPEC.md section 3.
 *
 * Two rules shape every function here:
 *
 * 1. The ciphertext is read with the service role and nowhere else. There is no
 *    `select` policy on `house_llm_credentials`, so a session client reading it
 *    gets zero rows; what a session reads is the `house_llm_config` view, which
 *    carries `key_last4` and no key material at all.
 * 2. Writes go through `set_house_llm_credential`, which checks house admin in
 *    the database. The route handler checks it too, for the better message.
 *
 * `lib/types/supabase.ts` is regenerated from a migrated database, so until
 * `npm run gen:types` has been run against one carrying migration 045 the
 * generated types do not know these relations. The untyped client below is that
 * gap, and it is confined to this file.
 */

type LooseClient = SupabaseClient;

function loose(client: Session["supabase"]): LooseClient {
  return client as unknown as LooseClient;
}

export type LlmCredentialStatus = "unverified" | "active" | "failing" | "disabled";

/** What the UI is allowed to see. No key material of any kind. */
export interface LlmConfigView {
  configured: boolean;
  provider?: string;
  model?: string;
  base_url?: string | null;
  key_last4?: string;
  status?: LlmCredentialStatus;
  last_verified_at?: string | null;
  last_error?: string | null;
}

export interface StoredCredential {
  houseId: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  sealed: SealedKey;
  status: LlmCredentialStatus;
}

export async function getLlmConfig(session: Session, houseId: string): Promise<LlmConfigView> {
  const { data, error } = await loose(session.supabase)
    .from("house_llm_config")
    .select("provider, model, base_url, key_last4, status, last_verified_at, last_error")
    .eq("house_id", houseId)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) return { configured: false };

  return {
    configured: true,
    provider: data.provider,
    model: data.model,
    base_url: data.base_url,
    key_last4: data.key_last4,
    status: data.status,
    last_verified_at: data.last_verified_at,
    last_error: data.last_error,
  };
}

export interface StoreCredentialInput {
  provider: string;
  model: string;
  baseUrl: string | null;
  sealed: SealedKey;
  keyLast4: string;
  status: LlmCredentialStatus;
  verifiedAt: string | null;
}

export async function storeCredential(
  session: Session,
  houseId: string,
  input: StoreCredentialInput,
): Promise<void> {
  const { error } = await loose(session.supabase).rpc("set_house_llm_credential", {
    p_house_id: houseId,
    p_provider: input.provider,
    p_model: input.model,
    p_base_url: input.baseUrl,
    p_key_ciphertext: toPgBytea(input.sealed.ciphertext),
    p_key_iv: toPgBytea(input.sealed.iv),
    p_key_tag: toPgBytea(input.sealed.tag),
    p_key_last4: input.keyLast4,
    p_key_version: input.sealed.version,
    p_status: input.status,
    p_verified_at: input.verifiedAt,
  });

  if (error) throw apiErrorFromPostgres(error);
}

export async function deleteCredential(session: Session, houseId: string): Promise<void> {
  const { error } = await loose(session.supabase).rpc("delete_house_llm_credential", {
    p_house_id: houseId,
  });
  if (error) throw apiErrorFromPostgres(error);
}

/**
 * The only read of the ciphertext, and it is service-role.
 *
 * Returns null rather than throwing when the table is absent, so a deployment
 * that has not yet applied migration 045 takes the deterministic path instead
 * of failing a schedule generation.
 */
export async function readSealedCredential(houseId: string): Promise<StoredCredential | null> {
  let client: LooseClient;
  try {
    client = createAdminClient() as unknown as LooseClient;
  } catch {
    // No service-role key in this environment — development, or a test run.
    return null;
  }

  const { data, error } = await client
    .from("house_llm_credentials")
    .select("provider, model, base_url, key_ciphertext, key_iv, key_tag, key_version, status")
    .eq("house_id", houseId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    houseId,
    provider: data.provider,
    model: data.model,
    baseUrl: data.base_url,
    status: data.status as LlmCredentialStatus,
    sealed: {
      ciphertext: fromPgBytea(data.key_ciphertext),
      iv: fromPgBytea(data.key_iv),
      tag: fromPgBytea(data.key_tag),
      version: data.key_version,
    },
  };
}

/** Every call writes one, including failures — the logging guarantee. */
export async function logLlmRun(houseId: string, record: LlmRunRecord): Promise<void> {
  let client: LooseClient;
  try {
    client = createAdminClient() as unknown as LooseClient;
  } catch {
    return;
  }

  await client.from("llm_runs").insert({
    house_id: houseId,
    purpose: record.purpose,
    provider: record.provider,
    model: record.model,
    input_payload: record.inputPayload,
    output_payload: record.outputPayload,
    accepted: record.accepted,
    validation_errors: record.validationErrors,
    prompt_tokens: record.promptTokens,
    completion_tokens: record.completionTokens,
    latency_ms: record.latencyMs,
    error: record.error,
  });
}

export interface LlmRunSummary {
  accepted: number;
  total: number;
  avgLatencyMs: number;
  failureCodes: { code: string; count: number }[];
  lastRejection: { at: string; errors: string[] } | null;
}

/**
 * Section 9 — what the admin schedule view shows. Acceptance rate over the last
 * twelve generations, the frequent failure codes, and the last rejection with
 * the constraints it actually broke.
 */
export async function getScheduleRunSummary(
  session: Session,
  houseId: string,
  limit = 12,
): Promise<LlmRunSummary | null> {
  const { data, error } = await loose(session.supabase)
    .from("llm_runs")
    .select("accepted, validation_errors, latency_ms, created_at")
    .eq("house_id", houseId)
    .eq("purpose", "schedule")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) return null;

  const counts = new Map<string, number>();
  let lastRejection: LlmRunSummary["lastRejection"] = null;

  for (const row of data) {
    const errors = (row.validation_errors ?? []) as string[];
    for (const entry of errors) {
      const code = String(entry).split(":")[0];
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    if (!row.accepted && !lastRejection && errors.length > 0) {
      lastRejection = { at: row.created_at, errors };
    }
  }

  return {
    accepted: data.filter((row) => row.accepted).length,
    total: data.length,
    avgLatencyMs: Math.round(
      data.reduce((sum, row) => sum + (row.latency_ms ?? 0), 0) / data.length,
    ),
    failureCodes: [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    lastRejection,
  };
}

/**
 * Section 3.6 — the credential's visible state.
 *
 * A rejected key is disabled and its admins are told once. A rate limit or a
 * run of timeouts is `failing`, which the house never sees: the deterministic
 * path runs and the settings page carries the note.
 */
export async function markCredentialStatus(
  houseId: string,
  status: LlmCredentialStatus,
  lastError: string | null,
): Promise<void> {
  let client: LooseClient;
  try {
    client = createAdminClient() as unknown as LooseClient;
  } catch {
    return;
  }

  const { data: existing } = await client
    .from("house_llm_credentials")
    .select("status, provider")
    .eq("house_id", houseId)
    .maybeSingle();

  if (!existing) return;
  if (existing.status === status && status !== "active") return;

  await client
    .from("house_llm_credentials")
    .update({ status, last_error: lastError, updated_at: new Date().toISOString() })
    .eq("house_id", houseId);

  // Once per replacement: only on the transition into `disabled`. Replacing the
  // key clears `status` and `last_error`, so the next rejection tells them again.
  if (status === "disabled" && existing.status !== "disabled") {
    await notifyAdminsKeyRejected(client, houseId, existing.provider);
  }
}

async function notifyAdminsKeyRejected(
  client: LooseClient,
  houseId: string,
  provider: string,
): Promise<void> {
  // `p_admins_only` is what makes this an administrative fact rather than house
  // news: the rest of the house has nothing to do about a rejected key and
  // would only learn that the AI they may not have noticed has stopped.
  await client.rpc("enqueue_house_notification", {
    p_house_id: houseId,
    p_type: "N-31",
    p_vars: { provider },
    p_exclude: null,
    p_tag: `llm-key-rejected-${houseId}`,
    p_payload: { provider },
    p_admins_only: true,
  });
}

/** Used by the routes for the good error message before the database refuses. */
export function requireAdmin(isAdmin: boolean): void {
  if (!isAdmin) throw new ApiError("ADMIN_REQUIRED");
}

// --- the digest's facts -----------------------------------------------------

/**
 * What call site 2 needs, assembled from the effort ledger — docs/10-LLM-SPEC.md
 * section 6.2.
 *
 * Three weeks are read: the one being summarised, the one before it (so
 * "improved on last week" can be said truthfully), and the one after it (so the
 * digest can end with what next week actually asks of anybody carrying a
 * deficit).
 */
export async function getDigestInput(
  session: Session,
  houseId: string,
  weekStart: string,
): Promise<DigestInput> {
  const previous = shiftWeek(weekStart, -7);
  const following = shiftWeek(weekStart, 7);

  const [ledgerResult, membersResult] = await Promise.all([
    session.supabase
      .from("effort_ledger")
      .select(
        "member_id, week_start, earned_points, effective_target, confirmed_count, missed_count",
      )
      .eq("house_id", houseId)
      .in("week_start", [previous, weekStart, following]),
    session.supabase
      .from("house_members")
      .select("id, display_name, users(display_name)")
      .eq("house_id", houseId)
      .eq("status", "active")
      .eq("does_chores", true),
  ]);

  if (ledgerResult.error) throw apiErrorFromPostgres(ledgerResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);

  type MemberLite = {
    id: string;
    display_name: string | null;
    users: { display_name: string } | null;
  };

  const nameById = new Map(
    ((membersResult.data ?? []) as unknown as MemberLite[]).map((row) => [
      row.id,
      row.users?.display_name ?? row.display_name ?? "Someone",
    ]),
  );

  const rows = ledgerResult.data ?? [];
  const forWeek = (week: string) => rows.filter((row) => row.week_start === week);

  const lastWeekEarned = new Map(
    forWeek(previous).map((row) => [row.member_id, row.earned_points]),
  );

  const members: DigestMember[] = forWeek(weekStart)
    .filter((row) => nameById.has(row.member_id))
    .map((row) => ({
      memberId: row.member_id,
      displayName: nameById.get(row.member_id) ?? "Someone",
      earned: row.earned_points,
      target: row.effective_target,
      done: row.confirmed_count,
      missed: row.missed_count,
      lastWeekEarned: lastWeekEarned.get(row.member_id) ?? 0,
    }))
    .sort((a, b) => b.earned - a.earned);

  // Only the people whose target actually moved. A note against somebody whose
  // week is unchanged is noise dressed as personalisation.
  const nextWeek = forWeek(following)
    .filter((row) => {
      const thisWeek = forWeek(weekStart).find((r) => r.member_id === row.member_id);
      return thisWeek !== undefined && row.effective_target > thisWeek.effective_target;
    })
    .map((row) => ({
      memberId: row.member_id,
      newTarget: row.effective_target,
      note: "target raised by the deficit carried out of this week",
    }));

  const previousMembers: DigestMember[] = forWeek(previous).map((row) => ({
    memberId: row.member_id,
    displayName: nameById.get(row.member_id) ?? "Someone",
    earned: row.earned_points,
    target: row.effective_target,
    done: row.confirmed_count,
    missed: row.missed_count,
    lastWeekEarned: 0,
  }));

  return {
    weekStart,
    weekEnd: shiftWeek(weekStart, 6),
    members,
    nextWeek,
    lastWeekTop3Share: previousMembers.length > 0 ? top3Share(previousMembers) : undefined,
  };
}

function shiftWeek(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
