/**
 * The seed's one connection to Supabase, and the checks that make a
 * half-filled `.env.local` fail loudly rather than half-way through.
 *
 * Service role, so it bypasses RLS but not constraints or triggers. That
 * distinction is the whole point: the seed writes the rows a real house would
 * have, and the database still refuses anything a real house could not reach.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("Missing Supabase settings in .env.local");
  process.exit(1);
}

/**
 * Seeding creates and deletes real accounts, so it refuses to run against
 * anything but a local stack unless the operator says otherwise out loud.
 */
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "yes") {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL does not point at a local stack.\n" +
      "Seeding creates and deletes accounts and writes a house's whole history.\n" +
      "If you really mean to do that here, re-run with SEED_ALLOW_REMOTE=yes.",
  );
  process.exit(1);
}

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const SUPABASE_URL = url;

export const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Every demo account shares this, because eight inboxes is not a demo. */
export const PASSWORD = "demo1234";

/** Throws with the table name attached, which Supabase's own error does not. */
export function must(where, { data, error }) {
  if (error) {
    const detail = [error.message, error.details, error.hint].filter(Boolean).join(" · ");
    throw new Error(`${where}: ${detail}`);
  }
  return data;
}

export async function insert(table, rows, select = "id") {
  return must(`insert ${table}`, await admin.from(table).insert(rows).select(select));
}

export async function insertOne(table, row, select = "id") {
  return must(`insert ${table}`, await admin.from(table).insert(row).select(select).single());
}

export async function update(table, patch, match) {
  let query = admin.from(table).update(patch);
  for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
  return must(`update ${table}`, await query.select("id"));
}
