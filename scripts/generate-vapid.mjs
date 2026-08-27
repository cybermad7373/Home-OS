/**
 * Generates a VAPID key pair for Web Push (RFC 8292).
 *
 *     node scripts/generate-vapid.mjs
 *
 * Node's own Web Crypto produces the pair; no dependency is needed and none is
 * added, because a key generator is exactly the kind of thing that should not
 * pull an unaudited package into the tree.
 *
 * The public key goes in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — it is public by
 * definition, since it is what the push service uses to verify our signature.
 * The private key goes to the Edge Functions and nowhere else:
 *
 *     npx supabase secrets set \
 *       VAPID_PUBLIC_KEY=<public> \
 *       VAPID_PRIVATE_KEY=<private> \
 *       VAPID_SUBJECT=mailto:you@example.com
 *
 * Rotating the pair invalidates every existing subscription: browsers bind a
 * subscription to the key it was created with. Every device re-registers on its
 * next app open, so the cost is one missed notification each, not a support
 * incident — but do not rotate casually.
 */
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);

const publicRaw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
const jwk = await subtle.exportKey("jwk", pair.privateKey);

console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=%s", base64Url(publicRaw));
console.log("VAPID_PUBLIC_KEY=%s", base64Url(publicRaw));
console.log("VAPID_PRIVATE_KEY=%s", jwk.d);
console.log();
console.log("The private key is a secret. It belongs in the Edge Function environment,");
console.log("never in .env.local's NEXT_PUBLIC_ half and never in a commit.");
