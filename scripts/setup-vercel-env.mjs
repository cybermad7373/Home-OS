#!/usr/bin/env node
/**
 * Interactive setup for the hosting (Vercel) environment variables.
 *
 *     node scripts/setup-vercel-env.mjs           # guided setup (Production)
 *     node scripts/setup-vercel-env.mjs --target=all
 *                                               # push to Production, Preview and Development
 *     node scripts/setup-vercel-env.mjs --list    # just show what is needed
 *
 * --target accepts production (default), preview, development or all. Use
 * `all` unless you have a reason not to: a Preview deployment reads ONLY the
 * Preview variables, so testing a preview URL with Production-only variables
 * fails every database call with a 500 before a single request leaves the
 * server (visible in the function log as no outgoing requests).
 *
 * What it does:
 *   1. Asks you for each required value, saying exactly where to find it.
 *      Nothing is ever written to disk — values live in memory only.
 *   2. Validates what you paste (URL shape, key shape) before accepting it.
 *   3. Generates the VAPID pair and (if you choose) a fresh LLM master key
 *      locally with Node's own crypto, same as npm run gen:vapid/gen:llmkey.
 *   4. Pushes everything to Vercel with the CLI if you are logged in
 *      (`npx vercel login` once, in your own terminal). Otherwise it prints
 *      a paste-ready table for the dashboard.
 *
 * The NEXT_PUBLIC_* variables are added non-sensitive on purpose: Vercel
 * refuses the Sensitive toggle on public-prefix variables because they are
 * baked into the pages every visitor receives. The server-only secrets are
 * pushed the same way and you can flip their Sensitive toggle in the
 * dashboard afterwards.
 */

import { createInterface } from "node:readline";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, webcrypto } from "node:crypto";

const VARS = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    hint: "Supabase dashboard → your project → Settings → Data API → Project URL (base URL only, no /rest/v1)",
    check: (v) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(v)
        ? null
        : "must be the bare project URL like https://<ref>.supabase.co — no trailing path such as /rest/v1",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    hint: "Same page → anon / public key (starts with eyJ…)",
    check: (v) => jwtWithRole(v, "anon"),
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    hint: "Same page → service_role key (click Reveal — a DIFFERENT key from anon)",
    check: (v) => jwtWithRole(v, "service_role"),
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: true,
    def: "https://home-blh3a8dmz-ruth-0e52.vercel.app",
    hint: "Your production domain, no trailing slash (added slashes are trimmed)",
    check: (v) => (v.startsWith("https://") ? null : "should start with https://"),
    trimSlashes: true,
  },
  {
    name: "LLM_KEY_ENCRYPTION_KEY",
    required: true,
    hint: "Must be IDENTICAL to the Edge Function secret. If none is set anywhere yet, type GENERATE.",
    check: (v) =>
      v.length >= 40 ? null : "looks too short for a 32-byte base64 key",
  },
  {
    name: "LLM_KEY_ENCRYPTION_KEY_VERSION",
    required: false,
    def: "1",
    hint: "Leave at 1 until you rotate the master key",
    check: (v) => (/^[1-9]\d*$/.test(v) ? null : "should be a positive integer"),
  },
  {
    name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    required: false,
    fromPair: true,
    hint: "Generated below together with the private half (type GENERATE), or paste your own",
    check: (v) => (v.length >= 80 ? null : "a VAPID public key is ~87 characters"),
  },
  {
    name: "VAPID_PRIVATE_KEY",
    required: false,
    fromPair: true,
    hint: "Comes with the pair — never paste this into a NEXT_PUBLIC_ variable",
    check: (v) => (v.length >= 40 ? null : "looks too short for a P-256 private key"),
  },
  {
    name: "VAPID_SUBJECT",
    required: false,
    def: "mailto:you@example.com",
    hint: "Replace with your real email",
    check: (v) => (v.startsWith("mailto:") ? null : "should look like mailto:you@example.com"),
  },
  {
    name: "APP_REVISION",
    required: false,
    auto: true,
    hint: "Filled in automatically from your current git commit",
    check: () => null,
  },
];

function isJwt(v) {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
}

/** Which Vercel environment(s) to push to. `--target=all` covers all three. */
function parseTargets() {
  const arg = process.argv.find((a) => a.startsWith("--target="));
  const value = arg ? arg.slice("--target=".length) : "production";
  const allowed = ["production", "preview", "development", "all"];
  if (!allowed.includes(value)) {
    console.error(`\nUnknown --target=${value}. Use one of: ${allowed.join(", ")}.\n`);
    process.exit(1);
  }
  return value === "all" ? ["production", "preview", "development"] : [value];
}

/** Reads the unsigned role claim so anon and service_role keys cannot be swapped. */
function jwtRole(v) {
  try {
    const payload = JSON.parse(Buffer.from(v.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function jwtWithRole(v, want) {
  if (!isJwt(v)) return "should be a token starting with eyJ… (three parts separated by dots)";
  const role = jwtRole(v);
  if (role !== want) {
    return role === null
      ? "could not read this token — copy it again from the dashboard"
      : `this key belongs to role "${role}", not "${want}" — copy the ${want} key instead`;
  }
  return null;
}

if (process.argv.includes("--list")) {
  console.log("\nHosting environment variables (docs/18-GO-LIVE.md §3.1):\n");
  for (const v of VARS) {
    console.log(`  ${v.required ? "[required]" : "[optional]"} ${v.name}`);
    console.log(`             find it: ${v.hint}`);
  }
  console.log("\nRun without --list for the guided setup.\n");
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function generateVapidPair() {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicRaw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: base64Url(publicRaw), privateKey: jwk.d };
}

function generateLlmKey() {
  return randomBytes(32).toString("base64");
}

function vercelWhoami() {
  // No --no-install: after `npx vercel login` the CLI lives in the npx cache,
  // and --no-install would refuse to use it.
  try {
    const out = execFileSync("npx", ["vercel", "whoami"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    return out.trim();
  } catch {
    return null;
  }
}

function currentSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function pushToVercel(name, value, target) {
  // Value travels on stdin, never on the command line (no process-list leak).
  const res = spawnSync("npx", ["vercel", "env", "add", name, target], {
    input: value,
    encoding: "utf8",
    timeout: 60000,
  });
  return res.status === 0
    ? { ok: true }
    : { ok: false, detail: (res.stderr || res.stdout || "unknown error").trim().split("\n").pop() };
}

console.log("\nHouseOS hosting env setup. Values stay in memory only — nothing is written to disk.\n");

const collected = new Map();
let pair = null;

for (const v of VARS) {
  if (v.auto) {
    const sha = currentSha();
    if (sha) {
      collected.set(v.name, sha);
      console.log(`  ${v.name} = ${sha} (from git)`);
    } else {
      console.log(`  ${v.name}: skipped (not a git checkout?)`);
    }
    continue;
  }

  for (;;) {
    if (v.fromPair && pair) {
      // Already filled when the pair was generated at the public-half prompt.
      break;
    }
    const suffix = v.def ? ` [${v.def}]` : "";
    let raw = (await ask(`${v.name}${suffix}\n  find it: ${v.hint}\n  > `)).trim();
    if (v.trimSlashes && raw !== "") {
      const trimmed = raw.replace(/\/+$/, "");
      if (trimmed !== raw) console.log("  (trailing slash removed)");
      raw = trimmed;
    }
    const value = raw === "" ? (v.def ?? "") : raw;

    if (value === "") {
      if (v.required) {
        console.log("  This one is required — the app cannot reach its database without it.\n");
        continue;
      }
      console.log("  Skipped.\n");
      break;
    }

    if (/^generate$/i.test(value) && v.name === "LLM_KEY_ENCRYPTION_KEY") {
      const fresh = generateLlmKey();
      console.log("\n  WARNING: only use a fresh key if no house has saved an AI key yet.");
      console.log("  A fresh key here must ALSO be set as an Edge Function secret, or");
      console.log("  scheduled jobs will fail to open sealed keys. Command for that is");
      console.log("  printed at the end.\n");
      const confirm = (await ask("  Type YES to use a fresh key, anything else to paste one: ")).trim();
      if (confirm !== "YES") continue;
      collected.set(v.name, fresh);
      console.log("  Generated and kept in memory only.\n");
      break;
    }

    if (/^generate$/i.test(value) && v.fromPair) {
      if (!pair) pair = await generateVapidPair();
      collected.set("NEXT_PUBLIC_VAPID_PUBLIC_KEY", pair.publicKey);
      collected.set("VAPID_PRIVATE_KEY", pair.privateKey);
      console.log("  Pair generated and kept in memory only (both halves filled).\n");
      break;
    }

    const problem = v.check(value);
    if (problem) {
      console.log(`  That doesn't look right: ${problem}. Try again.\n`);
      continue;
    }
    collected.set(v.name, value);
    console.log("  Accepted.\n");
    break;
  }
}

// If the pair was generated while answering the public half, the private-half
// iteration above breaks out via the pair branch having already stored both.
if (pair) {
  collected.set("NEXT_PUBLIC_VAPID_PUBLIC_KEY", pair.publicKey);
  collected.set("VAPID_PRIVATE_KEY", pair.privateKey);
}

rl.close();

const missing = VARS.filter((v) => v.required && !collected.has(v.name)).map((v) => v.name);
if (missing.length > 0) {
  console.log(`\nStill missing required: ${missing.join(", ")} — the app will not work without these.`);
}

const who = vercelWhoami();
if (!who) {
  console.log("\nVercel CLI is not logged in here (run `npx vercel login` to enable auto-push).");
  console.log("Paste-ready table for Settings → Environment Variables (Production):\n");
  for (const v of VARS) {
    if (collected.has(v.name)) console.log(`  ${v.name}=<the value you just entered>`);
    else console.log(`  ${v.name}=(skipped)`);
  }
} else {
  console.log(`\nLogged into Vercel as ${who}. Push collected values (${parseTargets().join(", ")})?`);
  const rl2 = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await new Promise((res) => rl2.question("Type YES to push, anything else to print the table instead: ", res))).trim();
  rl2.close();
  if (answer !== "YES") {
    console.log("\nNot pushed. Paste-ready table for Settings → Environment Variables (Production):\n");
    for (const v of VARS) {
      console.log(`  ${v.name}=${collected.has(v.name) ? "<the value you just entered>" : "(skipped)"}`);
    }
  } else {
    for (const target of parseTargets()) {
      console.log(`\nPushing to Vercel ${target}:`);
      for (const v of VARS) {
        if (!collected.has(v.name)) {
          console.log(`  SKIP ${v.name} (no value collected)`);
          continue;
        }
        const res = pushToVercel(v.name, collected.get(v.name), target);
        console.log(res.ok ? `  PUSHED ${v.name}` : `  FAILED ${v.name}: ${res.detail}`);
      }
    }
    console.log("\nNotes: NEXT_PUBLIC_* entries must stay NON-sensitive in the dashboard");
    console.log("(Vercel refuses the Sensitive toggle on public-prefix variables).");
    console.log("Flip the Sensitive toggle ON for the server-only secrets afterwards.");
  }
}

console.log("\nAfter the env is set, still needed (dashboard / CLI, not covered here):");
console.log("  1. Supabase → Authentication → URL Configuration: Site URL and");
console.log("     Redirect URL (/auth/callback) set to your production domain.");
console.log("  2. Edge Function secrets (if VAPID/LLM keys are new):");
console.log("       npx supabase secrets set VAPID_PUBLIC_KEY=<paste> VAPID_PRIVATE_KEY=<paste>");
console.log("         VAPID_SUBJECT=<paste> LLM_KEY_ENCRYPTION_KEY=<paste>");
console.log("  3. Vercel → Deployments → Redeploy, then check /api/health reads");
console.log('     {"status":"ok","database":true}.\n');
