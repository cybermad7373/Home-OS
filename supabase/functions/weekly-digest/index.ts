// Edge function: weekly-digest
//
// Sunday 21:00 house time, an hour after the coming week is published, so the
// digest can end with what next week actually asks of everybody.
//
// N-29 in docs/11-NOTIFICATIONS-SPEC.md, and exactly one per week — the volume
// rules in section 5 name it as its own category for that reason.
//
// The numbers are computed here and the model, when a house has a key, is
// asked to write them up (LLM spec section 6). With no key — or a rejected
// key, or a summary that names somebody who does not live here — the numeric
// digest below goes out unchanged, which is the acceptance criterion phase 9
// is measured against.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { complete, logRun, resolveJobProvider, type JobClient } from "../_shared/llm/complete.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The generated client's types are generic enough that inference gives up when
// it is handed to the shared LLM module. The module only reads one row and
// inserts another, and `JobClient` says exactly that.
const llmClient = supabase as unknown as JobClient;

const DIGEST_BODY_LIMIT = 180;

interface LedgerRow {
  member_id: string;
  earned_points: number;
  effective_target: number;
  confirmed_count: number;
  assigned_count: number;
  missed_count: number;
}

function truncate(text: string, limit = DIGEST_BODY_LIMIT): string {
  if (text.length <= limit) return text;
  const hard = text.slice(0, limit - 1);
  const lastSpace = hard.lastIndexOf(" ");
  const cut = lastSpace > limit - 30 ? hard.slice(0, lastSpace) : hard;
  return `${cut.trimEnd()}…`;
}

/** Monday of the week that has just ended, in ISO form. */
function lastWeekStart(at: Date): string {
  const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // 0 = Sunday. The week that just closed began on the Monday six days back.
  const shift = date.getUTCDay() === 0 ? 6 : date.getUTCDay() - 1;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

Deno.serve(async () => {
  const { data: houses, error } = await supabase.from("houses").select("id, name");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const weekStart = lastWeekStart(new Date());
  let sent = 0;
  let quiet = 0;

  for (const house of houses ?? []) {
    const { data: ledger } = await supabase
      .from("effort_ledger")
      .select("member_id, earned_points, effective_target, confirmed_count, assigned_count, missed_count")
      .eq("house_id", house.id)
      .eq("week_start", weekStart);

    // A house with no closed week has nothing to summarise, and a digest that
    // says "0 · 0 · 0" teaches everybody to ignore the next one.
    if (!ledger || ledger.length === 0) {
      quiet += 1;
      continue;
    }

    const rows = ledger as LedgerRow[];
    const memberIds = rows.map((row) => row.member_id);

    const { data: members } = await supabase
      .from("house_members")
      .select("id, display_name, users(display_name)")
      .in("id", memberIds);

    // The untyped client types an embedded one-to-one as an array, so the join
    // is normalised here rather than asserted away. A dependent has no user row
    // at all and carries their name on the membership instead.
    const nameById = new Map<string, string>(
      (members ?? []).map((row) => {
        const joined = row.users as { display_name?: string } | { display_name?: string }[] | null;
        const user = Array.isArray(joined) ? joined[0] : joined;
        return [row.id, user?.display_name ?? row.display_name ?? "Someone"] as [string, string];
      }),
    );

    const ranked = [...rows].sort((a, b) => b.earned_points - a.earned_points);
    const totalEarned = rows.reduce((sum, row) => sum + row.earned_points, 0);
    const totalAssigned = rows.reduce((sum, row) => sum + row.assigned_count, 0);
    const totalConfirmed = rows.reduce((sum, row) => sum + row.confirmed_count, 0);

    const completion = totalAssigned > 0
      ? Math.round((totalConfirmed / totalAssigned) * 100)
      : 0;

    // The BRD's headline metric: how much of the week's work three people did.
    const topThree = ranked.slice(0, 3).reduce((sum, row) => sum + row.earned_points, 0);
    const concentration = totalEarned > 0 ? Math.round((topThree / totalEarned) * 100) : 0;

    const board = ranked
      .map((row) => `${nameById.get(row.member_id) ?? "Someone"} ${row.earned_points}`)
      .join(" · ");

    const summary = `${board}. ${completion}% of chores done; the top three earned ${concentration}% of the points.`;

    const behind = ranked.filter((row) => row.earned_points < row.effective_target);
    const tail = behind.length > 0
      ? ` ${behind.length} ${behind.length === 1 ? "member is" : "members are"} below target.`
      : " Everybody met their target.";

    const numeric = `${summary}${tail}`;
    const written = await writeUp(house.id, rows, nameById, weekStart, completion, concentration);
    const body = truncate(written ?? numeric);

    for (const row of rows) {
      const { error: enqueueError } = await supabase.rpc("enqueue_notification", {
        p_house_id: house.id,
        p_member_id: row.member_id,
        p_type: "N-29",
        p_vars: { summary: body },
        p_tag: `digest-${weekStart}`,
        p_payload: { week_start: weekStart, concentration, completion },
      });
      if (!enqueueError) sent += 1;
    }
  }

  return Response.json({ week_start: weekStart, sent, houses_without_data: quiet });
});

const DIGEST_SYSTEM_PROMPT = `You write a short weekly summary for a shared house that tracks who does the
chores. Your reader is the whole house, including the people who did the least.

Write 3 to 5 sentences. Be factual and specific — use the actual numbers.

Name who carried the most work and who did the least. Do not soften it, and do
not editorialise about it either. State what happened and what changes next
week. No moralising, no exclamation marks, no praise beyond stating the facts.

If someone improved on last week, say so — even if they are still last.

Then state, in one sentence, what next week's schedule does differently and why.

Return only JSON matching the schema: {"summary": string, "highlights":
{"carried": string[], "coasted": string[], "improved": string[]},
"next_week_note": string}`;

interface DigestAnswer {
  summary?: string;
  highlights?: { carried?: string[]; coasted?: string[]; improved?: string[] };
  next_week_note?: string;
}

/**
 * The model's version of the same numbers, or null.
 *
 * Section 4's redaction contract holds here as it does in the app: first names,
 * points and counts go out, and nothing else — no member id, no email, no
 * house name.
 */
async function writeUp(
  houseId: string,
  rows: LedgerRow[],
  nameById: Map<string, string>,
  weekStart: string,
  completion: number,
  concentration: number,
): Promise<string | null> {
  const provider = await resolveJobProvider(llmClient, houseId);
  if (!provider) return null;

  const firstNames = new Map(
    rows.map((row) => [
      row.member_id,
      (nameById.get(row.member_id) ?? "Someone").trim().split(/\s+/)[0].slice(0, 20),
    ]),
  );

  const payload = {
    week: weekStart,
    members: rows.map((row, index) => ({
      id: `m${index + 1}`,
      name: firstNames.get(row.member_id),
      earned: row.earned_points,
      target: row.effective_target,
      done: row.confirmed_count,
      missed: row.missed_count,
    })),
    house: { completion_percent: completion, top3_share_percent: concentration },
  };

  const result = await complete<DigestAnswer>(provider, {
    system: DIGEST_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
    maxTokens: 800,
    temperature: 0.6,
  });

  const errors: string[] = [];
  const summary = result.data?.summary?.trim() ?? "";

  if (!result.ok) {
    errors.push(result.error ?? "CALL_FAILED");
  } else {
    if (summary.length < 80) errors.push(`SUMMARY_TOO_SHORT:${summary.length}`);
    if (summary.length > 800) errors.push(`SUMMARY_TOO_LONG:${summary.length}`);

    const known = new Set(firstNames.values());
    const highlights = result.data?.highlights ?? {};
    for (const group of ["carried", "coasted", "improved"] as const) {
      for (const name of highlights[group] ?? []) {
        if (!known.has(name.trim())) errors.push(`UNKNOWN_NAME:${name}`);
      }
    }

    // The invented-statistic guard: every digit run in the prose has to be a
    // number that was actually supplied.
    const supplied = new Set((JSON.stringify(payload).match(/\d+/g) ?? []));
    for (const digits of summary.match(/\d+/g) ?? []) {
      if (!supplied.has(digits)) errors.push(`INVENTED_NUMBER:${digits}`);
    }
  }

  await logRun(llmClient, houseId, {
    purpose: "digest",
    provider: provider.id,
    model: provider.model,
    input: payload,
    output: result.data ?? null,
    accepted: errors.length === 0 && result.ok,
    validationErrors: errors.length > 0 ? errors : null,
    latencyMs: result.latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    error: result.error,
  });

  return errors.length === 0 && result.ok ? summary : null;
}
