/**
 * Sealing a house's provider key — docs/10-LLM-SPEC.md section 3.3.
 *
 * AES-256-GCM through Web Crypto, so the Next.js server and the Deno Edge
 * Functions run the same algorithm with no Node-only dependency. The mirror of
 * this file lives at `supabase/functions/_shared/llm/crypto.ts` for the jobs,
 * for the reason recorded in D-06.
 *
 * Three properties are load-bearing:
 *
 * 1. The house id is the additional authenticated data, so a ciphertext lifted
 *    out of one row cannot be pasted into another. Decryption fails rather than
 *    returning somebody else's key.
 * 2. `key_version` names which master key sealed the row, so rotation needs no
 *    downtime: add a second master key, write with it, and version-1 rows keep
 *    decrypting until they are re-sealed.
 * 3. With no master key configured, sealing fails with a sentence. It never
 *    falls back to storing plaintext.
 */

export interface SealedKey {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
  version: number;
}

export class SealingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealingUnavailableError";
  }
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Version 1 is `LLM_KEY_ENCRYPTION_KEY`; version n is
 * `LLM_KEY_ENCRYPTION_KEY_V{n}`. Naming version 1 without a suffix keeps a
 * single-house self-host to one variable, which is the common case.
 */
function masterKeyMaterial(version: number): string | undefined {
  const name = version <= 1 ? "LLM_KEY_ENCRYPTION_KEY" : `LLM_KEY_ENCRYPTION_KEY_V${version}`;
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/** Which version new writes are sealed with. */
export function currentKeyVersion(): number {
  const raw = process.env.LLM_KEY_ENCRYPTION_KEY_VERSION;
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function sealingAvailable(): boolean {
  return masterKeyMaterial(currentKeyVersion()) !== undefined;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importMasterKey(version: number): Promise<CryptoKey> {
  const material = masterKeyMaterial(version);
  if (!material) {
    throw new SealingUnavailableError(
      version <= 1
        ? "LLM_KEY_ENCRYPTION_KEY is not set, so a provider key cannot be stored. Run `npm run gen:llmkey`."
        : `No master key for version ${version}. The row cannot be opened until it is set.`,
    );
  }

  const raw = decodeBase64(material);
  if (raw.length !== 32) {
    throw new SealingUnavailableError(
      "The master key must be 32 bytes, base64 encoded. Run `npm run gen:llmkey` for one.",
    );
  }

  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function aad(houseId: string): Uint8Array {
  return new TextEncoder().encode(houseId);
}

export async function sealKey(plaintext: string, houseId: string): Promise<SealedKey> {
  const version = currentKeyVersion();
  const key = await importMasterKey(version);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad(houseId) as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );

  // Web Crypto appends the authentication tag to the ciphertext; the schema
  // stores them apart, as most other AES-GCM implementations present them.
  return {
    ciphertext: sealed.slice(0, sealed.length - TAG_BYTES),
    tag: sealed.slice(sealed.length - TAG_BYTES),
    iv,
    version,
  };
}

export async function openKey(sealed: SealedKey, houseId: string): Promise<string> {
  const key = await importMasterKey(sealed.version);

  const joined = new Uint8Array(sealed.ciphertext.length + sealed.tag.length);
  joined.set(sealed.ciphertext, 0);
  joined.set(sealed.tag, sealed.ciphertext.length);

  const opened = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: sealed.iv as BufferSource,
      additionalData: aad(houseId) as BufferSource,
    },
    key,
    joined as BufferSource,
  );

  return new TextDecoder().decode(opened);
}

/** The last four characters, which is all the UI is ever given. */
export function keyLast4(plaintext: string): string {
  return plaintext.slice(-4);
}

// --- bytea over PostgREST ---------------------------------------------------
//
// PostgREST carries `bytea` as Postgres' hex output format. Both directions are
// here so no caller has to remember the `\x` prefix.

export function toPgBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

export function fromPgBytea(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export { decodeBase64, encodeBase64 };
