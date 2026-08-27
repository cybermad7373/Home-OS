#!/usr/bin/env node
/**
 * Generates the master key that seals every house's provider key.
 *
 * 32 random bytes, base64. It goes in two places, identical in both — the
 * server environment and the Edge Function secrets — because the app seals
 * keys and the scheduled jobs open them:
 *
 *   LLM_KEY_ENCRYPTION_KEY=...            in .env.local
 *   npx supabase secrets set LLM_KEY_ENCRYPTION_KEY=...
 *
 * Rotation: keep the old value, add the new one as LLM_KEY_ENCRYPTION_KEY_V2,
 * and set LLM_KEY_ENCRYPTION_KEY_VERSION=2. New writes seal with version 2 and
 * version 1 rows keep opening until they are re-saved.
 *
 * Losing this value does not lose any house data; it loses every stored
 * provider key, and each house has to paste theirs again.
 */

import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64");

console.log("");
console.log("LLM_KEY_ENCRYPTION_KEY=%s", key);
console.log("");
console.log("Put it in .env.local, then give the Edge Functions the same value:");
console.log("  npx supabase secrets set LLM_KEY_ENCRYPTION_KEY=%s", key);
console.log("");
console.log("It is not stored anywhere by this script. Copy it now.");
