// Opening a house's sealed provider key, inside an Edge Function.
//
// This is the Deno half of `lib/infra/llm/crypto.ts`. The duplication is the
// one D-06 describes and accepts: a scheduled job runs in Deno with no access
// to the Next.js module graph, and the alternative — a network hop to the app
// to have a key decrypted — would put the plaintext on the wire for no gain.
//
// Both halves are AES-256-GCM over Web Crypto with the house id as additional
// authenticated data, so a ciphertext sealed by either opens with the other.
// `tests/unit/llm-crypto.test.ts` and `crypto_test.ts` here hold them to it.

export interface SealedKey {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
  version: number;
}

const TAG_BYTES = 16;

function masterKeyMaterial(version: number): string | undefined {
  const name = version <= 1 ? "LLM_KEY_ENCRYPTION_KEY" : `LLM_KEY_ENCRYPTION_KEY_V${version}`;
  const value = Deno.env.get(name);
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importMasterKey(version: number): Promise<CryptoKey> {
  const material = masterKeyMaterial(version);
  if (!material) throw new Error(`no master key for version ${version}`);

  const raw = decodeBase64(material);
  if (raw.length !== 32) throw new Error("the master key must be 32 bytes, base64 encoded");

  return await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealKey(plaintext: string, houseId: string, version = 1): Promise<SealedKey> {
  const key = await importMasterKey(version);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: new TextEncoder().encode(houseId) as BufferSource,
      },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );

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
      additionalData: new TextEncoder().encode(houseId) as BufferSource,
    },
    key,
    joined as BufferSource,
  );

  return new TextDecoder().decode(opened);
}

/** PostgREST carries `bytea` as Postgres' hex output format. */
export function fromPgBytea(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function toPgBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}
