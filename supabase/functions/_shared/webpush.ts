// Web Push, from first principles — RFC 8291 (message encryption), RFC 8188
// (aes128gcm content coding) and RFC 8292 (VAPID).
//
// There is a library for this on npm. It is a Node library: it reaches for
// `crypto.createECDH` and `Buffer`, neither of which exists in an Edge
// Function. Rather than shim a Node runtime into Deno for two hundred lines of
// key agreement, the two hundred lines are here, written against Web Crypto,
// which both runtimes already have.
//
// The whole of it is four steps:
//
//   1. Agree a secret with the subscriber's public key (ECDH P-256).
//   2. Stretch it into a content-encryption key and a nonce (HKDF-SHA256).
//   3. Encrypt the payload with AES-128-GCM and frame it per RFC 8188.
//   4. Sign a short-lived JWT for the push service so it knows who we are.
//
// Nothing here is house-specific and nothing here talks to the database.

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  /** base64url of the 65-byte uncompressed public point. */
  publicKey: string;
  /** base64url of the 32-byte private scalar. */
  privateKey: string;
  /** `mailto:` or `https:` contact, per RFC 8292. */
  subject: string;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** True for 404 and 410 — the subscription is dead and must be deleted. */
  gone: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const utf8 = new TextEncoder();

// ---------------------------------------------------------------------------
// HKDF, the two-line version. Every output we need is at most 32 bytes, which
// is one HMAC block, so the counter loop of the full construction collapses.
// ---------------------------------------------------------------------------

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
  if (length > 32) throw new Error("hkdf: this implementation caps at one block");
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

// ---------------------------------------------------------------------------
// Payload encryption (RFC 8291 section 3.4)
// ---------------------------------------------------------------------------

/**
 * Exported so the round-trip test can decrypt what it produces. Nothing else
 * calls it: an aes128gcm frame is easy to build wrongly and impossible to
 * inspect afterwards, so the only honest proof is a receiver that reads it back.
 */
export async function encryptPayload(
  payload: string,
  subscription: PushSubscription,
): Promise<Uint8Array> {
  const userPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);

  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const ephemeralPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey),
  );

  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, ephemeral.privateKey, 256),
  );

  // The key-derivation info string binds the ciphertext to *this* pair of
  // public keys, which is what stops a captured message being replayed at a
  // different subscriber.
  const keyInfo = concat(
    utf8.encode("WebPush: info\0"),
    userPublic,
    ephemeralPublic,
  );
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, utf8.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // 0x02 is the last-record delimiter of RFC 8188. One record, so it is always
  // the last one.
  const plaintext = concat(utf8.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      plaintext as BufferSource,
    ),
  );

  // Header: salt(16) ‖ record size(4, big endian) ‖ key id length(1) ‖ key id.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);

  return concat(
    salt,
    recordSize,
    new Uint8Array([ephemeralPublic.length]),
    ephemeralPublic,
    ciphertext,
  );
}

// ---------------------------------------------------------------------------
// VAPID (RFC 8292)
// ---------------------------------------------------------------------------

export async function vapidHeader(endpoint: string, keys: VapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin;
  const publicBytes = base64UrlDecode(keys.publicKey);

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    // The uncompressed point is 0x04 ‖ x(32) ‖ y(32).
    x: base64UrlEncode(publicBytes.slice(1, 33)),
    y: base64UrlEncode(publicBytes.slice(33, 65)),
    d: keys.privateKey,
    ext: true,
  };

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64UrlEncode(utf8.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    utf8.encode(
      JSON.stringify({
        aud: audience,
        // Twelve hours. The maximum RFC 8292 allows is twenty-four; half of it
        // means a clock a few hours out of true still produces a valid token.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
    ),
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      utf8.encode(`${header}.${claims}`) as BufferSource,
    ),
  );

  const token = `${header}.${claims}.${base64UrlEncode(signature)}`;
  return `vapid t=${token}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------------------
// The send
// ---------------------------------------------------------------------------

/**
 * Delivers one notification to one subscription.
 *
 * Never throws. A push service that is down, a subscription that has expired
 * and a payload that is too large all resolve to a `SendResult` — because the
 * caller is sending a batch, and one dead device must not abort the other
 * seven (section 9 of the notifications spec).
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: string,
  keys: VapidKeys,
  ttlSeconds = 24 * 60 * 60,
): Promise<SendResult> {
  try {
    const body = await encryptPayload(payload, subscription);
    const authorization = await vapidHeader(subscription.endpoint, keys);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "normal",
      },
      body: body as BodyInit,
    });

    // 404 means the endpoint never existed; 410 means it has been revoked.
    // Either way the row is dead and the caller deletes it.
    const gone = response.status === 404 || response.status === 410;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, status: response.status, gone, error: text.slice(0, 300) };
    }

    return { ok: true, status: response.status, gone: false };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      gone: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function vapidFromEnv(): VapidKeys | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@houseos.app",
  };
}
