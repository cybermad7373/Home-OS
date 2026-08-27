// Round-trip test for the Web Push implementation.
//
//     npm run test:functions
//
// An aes128gcm frame is easy to build wrongly and impossible to inspect
// afterwards: a push service returns 201 for a well-formed request whose
// ciphertext the browser will silently fail to decrypt, and the first evidence
// of a mistake is a member who never gets notified. So this test plays the
// receiver — it generates a subscriber key pair, hands the public half to
// `encryptPayload`, and decrypts the result the way a browser would.
//
// If this passes, the bytes on the wire are correct. It is the only proof that
// does not require a physical phone.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  vapidHeader,
  type PushSubscription,
} from "./webpush.ts";

const utf8 = new TextEncoder();
const decoder = new TextDecoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource));
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

/** A subscriber, as a browser would create one. */
async function makeSubscriber() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  const subscription: PushSubscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    p256dh: base64UrlEncode(publicRaw),
    auth: base64UrlEncode(authSecret),
  };

  return { subscription, privateKey: pair.privateKey, publicRaw, authSecret };
}

/** The browser's half of RFC 8291: undo what `encryptPayload` did. */
async function decrypt(
  body: Uint8Array,
  privateKey: CryptoKey,
  publicRaw: Uint8Array,
  authSecret: Uint8Array,
): Promise<string> {
  const salt = body.slice(0, 16);
  const idLength = body[20];
  const senderPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);

  const senderKey = await crypto.subtle.importKey(
    "raw",
    senderPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: senderKey }, privateKey, 256),
  );

  const keyInfo = concat(utf8.encode("WebPush: info\0"), publicRaw, senderPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const contentKey = await hkdf(salt, ikm, utf8.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      ciphertext as BufferSource,
    ),
  );

  // The trailing byte is RFC 8188's record delimiter, not content.
  assertEquals(plaintext[plaintext.length - 1], 2, "missing the last-record delimiter");
  return decoder.decode(plaintext.slice(0, -1));
}

Deno.test("a subscriber can decrypt what we encrypt for them", async () => {
  const { subscription, privateKey, publicRaw, authSecret } = await makeSubscriber();

  const payload = JSON.stringify({
    title: "Cook dinner — 19:30",
    body: "30 points. Window: 19:30 to 22:00.",
    tag: "chore-abc",
    data: { url: "/chores/mine", type: "N-02" },
  });

  const body = await encryptPayload(payload, subscription);
  assertEquals(await decrypt(body, privateKey, publicRaw, authSecret), payload);
});

Deno.test("the frame has the header RFC 8188 describes", async () => {
  const { subscription } = await makeSubscriber();
  const body = await encryptPayload("hello", subscription);

  // salt(16) ‖ record size(4) ‖ key id length(1) ‖ key id(65) ‖ ciphertext
  const recordSize = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false);
  assertEquals(recordSize, 4096);
  assertEquals(body[20], 65, "the key id must be an uncompressed P-256 point");
  assertEquals(body[21], 0x04, "an uncompressed point starts with 0x04");

  // "hello" plus the delimiter is six bytes; GCM adds a sixteen-byte tag.
  assertEquals(body.length, 16 + 4 + 1 + 65 + 6 + 16);
});

Deno.test("non-ASCII copy survives the round trip", async () => {
  const { subscription, privateKey, publicRaw, authSecret } = await makeSubscriber();

  // The product's copy is full of rupee signs and em dashes; a length taken in
  // characters rather than bytes would corrupt exactly these.
  const payload = "₹1,240 approved — you're square. நன்றி";
  const body = await encryptPayload(payload, subscription);

  assertEquals(await decrypt(body, privateKey, publicRaw, authSecret), payload);
});

Deno.test("every message gets its own salt and ephemeral key", async () => {
  const { subscription } = await makeSubscriber();

  const first = await encryptPayload("same text", subscription);
  const second = await encryptPayload("same text", subscription);

  assert(
    base64UrlEncode(first.slice(0, 16)) !== base64UrlEncode(second.slice(0, 16)),
    "the salt must never repeat",
  );
  assert(
    base64UrlEncode(first.slice(21, 86)) !== base64UrlEncode(second.slice(21, 86)),
    "the ephemeral key must never repeat",
  );
});

Deno.test("the VAPID header is a signed ES256 token the push service can verify", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

  const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc123", {
    publicKey: base64UrlEncode(publicRaw),
    privateKey: jwk.d!,
    subject: "mailto:admin@houseos.app",
  });

  assertStringIncludes(header, "vapid t=");
  assertStringIncludes(header, `k=${base64UrlEncode(publicRaw)}`);

  const token = header.slice("vapid t=".length, header.indexOf(", k="));
  const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");

  const claims = JSON.parse(decoder.decode(base64UrlDecode(encodedClaims)));
  // The audience is the push service's origin, not the endpoint path — a token
  // scoped to the whole path would leak which subscription it was minted for.
  assertEquals(claims.aud, "https://fcm.googleapis.com");
  assertEquals(claims.sub, "mailto:admin@houseos.app");
  assert(claims.exp > Math.floor(Date.now() / 1000), "the token is already expired");
  assert(
    claims.exp <= Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    "RFC 8292 caps the lifetime at twenty-four hours",
  );

  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pair.publicKey,
    base64UrlDecode(encodedSignature) as BufferSource,
    utf8.encode(`${encodedHeader}.${encodedClaims}`) as BufferSource,
  );
  assert(verified, "the push service would reject this signature");
});
