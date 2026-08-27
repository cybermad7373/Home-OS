// The Edge Function half of the sealing tests — LLM spec section 10.
//
// Run by `npm run test:functions`, alongside the Web Push round trip. What it
// proves is what the app half proves, in the runtime the jobs actually use:
// a key sealed for one house does not open for another, and a version whose
// master key is absent fails rather than returning something.

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fromPgBytea, openKey, sealKey, toPgBytea } from "./crypto.ts";

const KEY_A = "IWpjMzZ0OTNyaHZ3ZjkxNGZrM2E4c2RmOTMyaGYzMWQ=";
const HOUSE_A = "11111111-1111-4111-8111-111111111111";
const HOUSE_B = "22222222-2222-4222-8222-222222222222";

Deno.env.set("LLM_KEY_ENCRYPTION_KEY", KEY_A);

Deno.test("a sealed key opens again for the same house", async () => {
  const sealed = await sealKey("gsk_a-provider-key", HOUSE_A);
  assertEquals(await openKey(sealed, HOUSE_A), "gsk_a-provider-key");
});

Deno.test("a key sealed for one house does not open for another", async () => {
  const sealed = await sealKey("gsk_a-provider-key", HOUSE_A);
  await assertRejects(() => openKey(sealed, HOUSE_B));
});

Deno.test("a version with no master key set refuses to open", async () => {
  const sealed = await sealKey("gsk_a-provider-key", HOUSE_A);
  await assertRejects(() => openKey({ ...sealed, version: 7 }, HOUSE_A));
});

Deno.test("bytea survives the round trip through Postgres' hex form", async () => {
  const sealed = await sealKey("gsk_a-provider-key", HOUSE_A);
  const reread = {
    ciphertext: fromPgBytea(toPgBytea(sealed.ciphertext)),
    iv: fromPgBytea(toPgBytea(sealed.iv)),
    tag: fromPgBytea(toPgBytea(sealed.tag)),
    version: sealed.version,
  };
  assertEquals(await openKey(reread, HOUSE_A), "gsk_a-provider-key");
});
