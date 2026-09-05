#!/usr/bin/env node
/**
 * Takes a backup of a Postgres database, and says whether it worked.
 *
 * `docs/18-GO-LIVE.md` left it open: "No monitoring and no backup policy has
 * been chosen. Supabase takes daily backups on paid plans; on the free tier it
 * does not." On the free tier, this is the backup policy — a `pg_dump` on a
 * schedule, kept somewhere off the machine that holds the database.
 *
 *   npm run backup                  -- dump the database in SUPABASE_DB_URL
 *   npm run backup -- --local       -- dump the local supabase stack instead
 *   npm run backup -- --verify FILE -- check a dump before trusting it
 *
 * It dumps through the Supabase CLI rather than calling `pg_dump` directly.
 * The CLI runs a `pg_dump` of the right version inside Docker, so this works on
 * a machine that has no Postgres client installed — which most machines that
 * would run a nightly backup do not.
 *
 * ## What this writes, and where
 *
 * Two files per run, into `BACKUP_DIR` (default `./backups`, which
 * `.gitignore` excludes):
 *
 *   houseos-<stamp>.schema.sql   every table, function, policy and trigger
 *   houseos-<stamp>.data.sql     every row
 *
 * Separately, because they fail differently and are restored differently: a
 * schema that will not load is a broken deploy, and data that will not load is
 * a broken restore, and finding out which is half the work at three in the
 * morning.
 *
 * ## The rule about where these go
 *
 * **A dump is the whole product's household data in one file** — every expense,
 * every name, every note. It must never be committed, never be attached to an
 * issue, and never sit only on the laptop that would be lost with the laptop.
 * The runbook in `docs/19-BACKUP.md` says where it should go instead.
 *
 * ## Why it verifies
 *
 * An untested backup is a belief. Every run checks its own output for the
 * marker `pg_dump` writes at the end, because a truncated dump — a disk that
 * filled, a connection that dropped — looks exactly like a good one until the
 * day it is needed. `--verify` runs the same check against a file on its own.
 *
 * That is a floor, not a restore test. The runbook in `docs/19-BACKUP.md` says
 * how to do the real one — load a dump into a scratch project and look at it —
 * and how often.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const wantsLocal = args.includes("--local");
const verifyIndex = args.indexOf("--verify");
const verifyTarget = verifyIndex >= 0 ? args[verifyIndex + 1] : null;
const keep = Number.parseInt(process.env.BACKUP_KEEP ?? "14", 10);
const directory = process.env.BACKUP_DIR ?? "backups";

/** The local stack's connection string, as `supabase status` reports it. */
const LOCAL_DB_URL = process.env.LOCAL_DB_URL ?? null;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * The connection string, and never its password in any output.
 *
 * Everything this script prints goes through here first, because a backup
 * script that logs its own connection string puts the database password in
 * whatever collected the log.
 */
function redact(url) {
  try {
    const parsed = new URL(url);
    parsed.password = "***";
    return parsed.toString();
  } catch {
    return "[unparseable connection string]";
  }
}

/**
 * The same, for arbitrary text — the CLI's own error output, which may quote
 * the connection string back and is not itself a URL.
 */
function redactText(text) {
  return text.replace(/(\w+:\/\/[^:@\s]+):[^@\s]+@/g, "$1:***@");
}

/**
 * The Supabase CLI, run as a Node script rather than through a shell.
 *
 * One of these arguments is a connection string with a password in it, and
 * `shell: true` on Windows concatenates arguments rather than escaping them.
 * Without a shell, `npx.cmd` cannot be spawned at all on modern Node — so this
 * runs the CLI's own entry point with the Node that is already running, which
 * needs neither.
 */
const CLI = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));

function supabase(commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...commandArgs], {
      stdio: ["ignore", "inherit", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      // The connection string can appear in the CLI's own error output, so
      // nothing from it is printed raw.
      else reject(new Error(`supabase db dump exited with ${code}\n${redact(stderr.trim())}`));
    });
  });
}

/**
 * A complete dump ends in a way a truncated one cannot.
 *
 * Two markers, because the two dumps end differently. A schema dump keeps
 * `pg_dump`'s own closing comment — that is what `--keep-comments` is for, and
 * it cannot be combined with `--data-only`, which is why the data dump does not
 * have it. What the data dump does have is the `RESET ALL;` the CLI appends
 * after the last row.
 *
 * Either one is proof the process reached the end. Neither can be produced by a
 * disk that filled or a connection that dropped halfway, which is the whole
 * failure this is looking for: a dump that is 90% complete restores 90% of a
 * household, and looks exactly like a good one until the day it is needed.
 */
async function verify(file) {
  const info = await stat(file).catch(() => null);
  if (!info) fail(`No such file: ${file}`);
  if (info.size === 0) fail(`${file} is empty.`);

  const text = await readFile(file, "utf8");
  const complete =
    text.includes("PostgreSQL database dump complete") || text.trimEnd().endsWith("RESET ALL;");

  if (!complete) {
    fail(
      `${file} does not end the way a finished dump ends, so something ` +
        `interrupted it. Do not rely on this file.`,
    );
  }

  console.log(`  ok   ${path.basename(file)}  ${(info.size / 1024 / 1024).toFixed(1)} MB`);
  return true;
}

/** Deletes all but the newest `keep` runs, so a nightly job cannot fill a disk. */
async function prune() {
  const entries = await readdir(directory).catch(() => []);
  const stamps = [
    ...new Set(
      entries
        .filter((name) => name.startsWith("houseos-") && name.endsWith(".sql"))
        .map((name) => name.split(".")[0]),
    ),
  ].sort();

  const doomed = stamps.slice(0, Math.max(0, stamps.length - keep));
  for (const stamp of doomed) {
    for (const suffix of ["schema", "data"]) {
      await unlink(path.join(directory, `${stamp}.${suffix}.sql`)).catch(() => {});
    }
    console.log(`  pruned ${stamp}`);
  }
}

async function main() {
  if (verifyTarget) {
    await verify(verifyTarget);
    return;
  }

  const url = wantsLocal ? LOCAL_DB_URL : process.env.SUPABASE_DB_URL;
  if (!url) {
    fail(
      wantsLocal
        ? "Set LOCAL_DB_URL to the DB_URL from `npx supabase status`."
        : "Set SUPABASE_DB_URL to the database this backup is of. See docs/19-BACKUP.md.",
    );
  }

  await mkdir(directory, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = path.join(directory, `houseos-${stamp}`);

  console.log(`\n  Backing up ${redact(url)}`);
  console.log(`  into ${path.resolve(directory)}\n`);

  // Schema and data separately: they fail differently and they are restored
  // differently, and knowing which one is broken is half the work.
  // `--keep-comments`, and it is not cosmetic: the CLI strips comment lines by
  // default, and the line `pg_dump` writes at the very end to say it finished
  // is a comment. Without them a truncated dump and a complete one end the same
  // way, and the check below cannot tell them apart.
  await supabase([
    "db",
    "dump",
    "--db-url",
    url,
    "--keep-comments",
    "--file",
    `${base}.schema.sql`,
  ]);
  await supabase([
    "db",
    "dump",
    "--db-url",
    url,
    "--data-only",
    // COPY rather than a million INSERTs: an order of magnitude smaller and an
    // order of magnitude faster to load back.
    "--use-copy",
    "--file",
    `${base}.data.sql`,
  ]);

  await verify(`${base}.schema.sql`);
  await verify(`${base}.data.sql`);
  await prune();

  console.log(
    `\n  Done. These files contain every household's records — move them ` +
      `somewhere off this machine and never commit them.\n`,
  );
}

main().catch((error) => fail(error.message));
