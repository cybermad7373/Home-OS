/**
 * Drives every AI call site against a running app, with the real key.
 *
 *   npm run dev            # in one terminal
 *   npm run seed:ai        # in another
 *
 * This exists because "the key is configured" and "the key works" turned out to
 * be very different claims. Every one of this project's first eleven `llm_runs`
 * rows carried `accepted: false` and a 404 from Google saying the pinned model
 * had been retired — and because a provider failure is designed to fall through
 * to the deterministic branch with nothing shown to the user, no screen ever
 * said so. The AI features looked unbuilt rather than broken.
 *
 * So the calls go through the app's own routes rather than the library: sign in
 * the way a person does, select a Home the way the switcher does, and let the
 * route handler, the router, the capability switch, the rate cap, the circuit
 * breaker and the provider all take their turn. What lands in `llm_runs`
 * afterwards is the truth about whether AI works here.
 */
import { admin, APP_URL, must, PASSWORD } from "./seed/env.mjs";
import { HOMES } from "./seed/profiles.mjs";
import { todayIn, weekStartOf, addDays } from "./seed/util.mjs";

/**
 * A free provider tier is rated per minute, and firing five call sites
 * back to back is enough to trip it. The pause is not politeness — without it
 * the run reports a rate limit as though it were a broken integration.
 */
const PAUSE_MS = Number(process.env.SEED_AI_PAUSE_MS ?? 6000);
const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

const base = process.env.SEED_AI_URL ?? APP_URL;

/** A cookie jar, because the session is a cookie and every call needs it. */
function jar() {
  const cookies = new Map();
  return {
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    absorb(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(";");
        const index = pair.indexOf("=");
        if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    },
  };
}

async function call(session, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      cookie: session.header(),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  session.absorb(response);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function signIn(username) {
  const session = jar();
  const result = await call(session, "POST", "/api/auth/signin", {
    identifier: username,
    password: PASSWORD,
  });
  if (result.status !== 200) {
    throw new Error(`sign in as ${username}: ${result.status} ${result.text.slice(0, 200)}`);
  }
  return session;
}

async function selectHome(session, houseId) {
  const result = await call(session, "POST", "/api/homes/select", { house_id: houseId });
  if (result.status >= 400) {
    throw new Error(`select home: ${result.status} ${result.text.slice(0, 200)}`);
  }
}

async function houseIdOf(name) {
  const row = must(
    "select houses",
    await admin.from("houses").select("id").eq("name", name).maybeSingle(),
  );
  if (!row?.id) throw new Error(`${name} is not seeded. Run \`npm run seed:reset\` first.`);
  return row.id;
}

async function runsSince(houseId, since) {
  return must(
    "select llm_runs",
    await admin
      .from("llm_runs")
      .select("purpose, accepted, latency_ms, prompt_tokens, completion_tokens, error")
      .eq("house_id", houseId)
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
  );
}

function line(label, result) {
  const status = result.status >= 400 ? `HTTP ${result.status}` : "ok";
  console.log(`  ${label.padEnd(34)} ${status}`);
  if (result.status >= 400) {
    console.log(`    ${result.text.replace(/\s+/g, " ").slice(0, 240)}`);
  }
  return result;
}

async function driveHome(home, username) {
  const houseId = await houseIdOf(home.name);
  const today = todayIn(home.timezone);
  const since = new Date(Date.now() - 1000).toISOString();

  console.log(`\n${home.name}  (signed in as ${username})`);
  const session = await signIn(username);
  await selectHome(session, houseId);

  // 1. Natural-language entry. The amount is the interesting part: rupees in,
  //    integer paise out, and the app's own boundary is the only place that
  //    conversion is allowed to happen.
  const parsed = line(
    "natural_language  /api/ai/parse",
    await call(session, "POST", "/api/ai/parse", {
      text: "450 for vegetables from the market, split between everyone",
    }),
  );
  if (parsed.json?.parsed) {
    console.log(`    ${JSON.stringify(parsed.json.parsed).slice(0, 160)}`);
  }

  // 2. Rule parsing. Lead only.
  await pause();
  const rule = line(
    "rule_parsing      /api/rules/parse",
    await call(session, "POST", "/api/rules/parse", {
      text: "Anyone who leaves dishes in the sink overnight does the washing up the next evening as well.",
    }),
  );
  if (rule.json) console.log(`    parsed_by=${rule.json.parsed_by} confidence=${rule.json.confidence ?? "-"}`);

  // 3. The weekly digest, for the week that has just ended.
  await pause();
  const digest = line(
    "weekly_summary    /api/ai/digest",
    await call(
      session,
      "GET",
      `/api/ai/digest?week_start=${addDays(weekStartOf(today), -7)}`,
    ),
  );
  if (digest.json) {
    console.log(`    generated=${digest.json.generated}`);
    if (digest.json.summary) console.log(`    ${String(digest.json.summary).slice(0, 200)}`);
  }

  // 4. Food ideas, alongside the deterministic library half.
  await pause();
  const food = line(
    "food_ideas        /api/food/suggestions",
    await call(session, "GET", "/api/food/suggestions?mealType=dinner"),
  );
  if (food.json) {
    // `library` is a RankResult, not an array: {suggestions, message, coldStart}.
    const suggestions = food.json.library?.suggestions ?? [];
    const ideas = food.json.ai?.ideas ?? food.json.ai ?? null;
    console.log(
      `    library=${suggestions.length}${food.json.library?.message ? ` (${food.json.library.message})` : ""} ai=${ideas ? JSON.stringify(ideas).slice(0, 200) : "null"}`,
    );
  }

  // 5. Schedule proposal, for real rather than as a dry run.
  //
  //    `generateWeek` returns the engine's summary and stops before the model
  //    overlay when `dry_run` is set, so a dry run can never exercise this call
  //    site — which is why an earlier attempt at this script reported the
  //    schedule as silently doing nothing. The week generated is the one after
  //    this one, which the seed leaves empty for exactly this purpose.
  await pause();
  const schedule = line(
    "schedule_proposals /api/chores/generate",
    await call(session, "POST", "/api/chores/generate", {
      week_start: addDays(weekStartOf(today), 7),
      dry_run: false,
    }),
  );
  if (schedule.json) {
    console.log(
      `    generator=${schedule.json.generator ?? "-"} assignments=${schedule.json.assignments?.length ?? schedule.json.assigned_count ?? "-"} llm_accepted=${schedule.json.llm_accepted ?? "-"}`,
    );
  }

  // 6. Verifying a key, which is the one call an admin makes on purpose.
  if (process.env.LLM_API_KEY) {
    await pause();
    const verify = line(
      "verify            /api/ai/credentials/verify",
      await call(session, "POST", "/api/ai/credentials/verify", {
        provider: process.env.LLM_PROVIDER ?? "gemini",
        model: process.env.LLM_MODEL ?? "gemini-flash-latest",
        api_key: process.env.LLM_API_KEY,
      }),
    );
    if (verify.json) {
      console.log(
        `    ok=${verify.json.ok} ${verify.json.ok ? `${verify.json.latency_ms}ms ${verify.json.model_echo}` : `${verify.json.error} — ${String(verify.json.detail ?? "").replace(/\s+/g, " ").slice(0, 140)}`}`,
      );
    }
  }

  const runs = await runsSince(houseId, since);
  console.log(`\n  llm_runs written: ${runs.length}`);
  for (const run of runs) {
    const outcome = run.accepted
      ? `accepted  ${run.latency_ms ?? "?"}ms  ${run.prompt_tokens ?? "?"}+${run.completion_tokens ?? "?"} tokens`
      : `REJECTED  ${String(run.error ?? "no error recorded").replace(/\s+/g, " ").slice(0, 120)}`;
    console.log(`    ${run.purpose.padEnd(20)} ${outcome}`);
  }
  return runs;
}

async function main() {
  const health = await fetch(`${base}/api/ai/providers`).catch(() => null);
  if (!health) {
    console.error(`\nNothing is answering at ${base}. Start the app with \`npm run dev\` first.\n`);
    process.exit(1);
  }

  const all = [];
  // Anna Nagar has every capability on and `demo` is its admin, so all five
  // call sites are reachable from one session.
  all.push(...(await driveHome(HOMES[0], "demo")));

  // Velachery has schedule proposals and the weekly summary switched off. Both
  // should answer normally and write *no* run at all: a capability that is off
  // behaves exactly as if no key were configured, for that feature alone.
  const off = await driveHome(HOMES[1], "priya");
  const leaked = off.filter((run) => ["schedule", "digest"].includes(run.purpose));
  if (leaked.length > 0) {
    console.log(`\n  A switched-off capability still called the provider: ${leaked.map((r) => r.purpose).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\n  Switched-off capabilities called nothing, as intended.");
  }
  all.push(...off);

  // Sharma's credential is `disabled`, which must not fall through to the
  // environment key. An admin who chose a provider and had it refuse the key
  // should not have the operator's quota spent instead.
  const sharma = await driveHome(HOMES[2], "rajesh");
  if (sharma.length > 0) {
    console.log("\n  A disabled credential fell through to the environment key.");
    process.exitCode = 1;
  } else {
    console.log("\n  A disabled credential called nothing, as intended.");
  }

  const accepted = all.filter((run) => run.accepted).length;
  console.log(`\n${accepted} of ${all.length} provider calls were accepted.\n`);
  if (accepted === 0) process.exitCode = 1;

}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
