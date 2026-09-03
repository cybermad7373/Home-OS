/**
 * The Home's own AI credential, sealed the way the app seals it.
 *
 * Credentials are house-owned and encrypted, never a deployment-wide
 * environment key (docs/10-LLM-SPEC.md). The sealing here mirrors
 * `lib/infra/llm/crypto.ts` exactly — AES-256-GCM through Web Crypto, the house
 * id as additional authenticated data, ciphertext and tag stored apart — so a
 * row written by the seed is one the app can open, and one written against the
 * wrong house cannot be opened at all.
 *
 * The three homes are given three different states on purpose. A settings
 * screen that has only ever shown a working key has never shown the two states
 * an admin actually needs to recognise.
 */
import { insertOne } from "./env.mjs";
import { hoursAgo } from "./util.mjs";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function decodeBase64(value) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function toPgBytea(bytes) {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

function masterKey() {
  const version = Number.parseInt(process.env.LLM_KEY_ENCRYPTION_KEY_VERSION ?? "1", 10) || 1;
  const name = version <= 1 ? "LLM_KEY_ENCRYPTION_KEY" : `LLM_KEY_ENCRYPTION_KEY_V${version}`;
  const material = process.env[name]?.trim();
  if (!material) return null;
  const raw = decodeBase64(material);
  if (raw.length !== 32) {
    throw new Error(`${name} must be 32 bytes, base64 encoded. Run \`npm run gen:llmkey\`.`);
  }
  return { raw, version };
}

async function seal(plaintext, houseId, master) {
  const key = await crypto.subtle.importKey("raw", master.raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(houseId) },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return {
    key_ciphertext: toPgBytea(sealed.slice(0, sealed.length - TAG_BYTES)),
    key_tag: toPgBytea(sealed.slice(sealed.length - TAG_BYTES)),
    key_iv: toPgBytea(iv),
    key_version: master.version,
  };
}

/**
 * Per home, so the settings screen has all three states to render:
 *
 *   anna-nagar  active, everything on
 *   velachery   active, three call sites switched off by the house
 *   sharma      disabled, with the error the provider actually returned
 */
const SHAPE = {
  "anna-nagar": {
    status: "active",
    capabilities: {},
    lastVerifiedAt: () => hoursAgo(5),
  },
  velachery: {
    status: "active",
    capabilities: { schedule_proposals: false, weekly_summary: false, food_normalise: false },
    lastVerifiedAt: () => hoursAgo(70),
  },
  sharma: {
    status: "disabled",
    capabilities: {},
    lastVerifiedAt: () => hoursAgo(200),
    lastError:
      "The provider rejected this key with 401 Unauthorized. It may have been revoked in the console.",
    useRealKey: false,
  },
};

export async function seedAiCredentials(context) {
  const { houseId, home, accountIds } = context;

  const master = masterKey();
  if (!master) {
    console.log("    (no LLM_KEY_ENCRYPTION_KEY — skipping the AI credential)");
    return;
  }

  const shape = SHAPE[home.key];
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  const model = process.env.LLM_MODEL ?? "gemini-flash-latest";
  const realKey = process.env.LLM_API_KEY;

  // A home meant to demonstrate the failed state gets a key that cannot work,
  // rather than a working key marked broken — the demo should not lie about
  // which of its rows would actually authenticate.
  const plaintext =
    shape.useRealKey === false || !realKey ? "AIzaSyDemoRevokedKeyNotValid00000000000" : realKey;

  if (!realKey && shape.useRealKey !== false) {
    console.log("    (no LLM_API_KEY — sealing a placeholder, AI calls will fail)");
  }

  const capabilities = {
    schedule_proposals: true,
    weekly_summary: true,
    natural_language: true,
    rule_parsing: true,
    food_ideas: true,
    food_normalise: true,
    ...shape.capabilities,
  };

  await insertOne(
    "house_llm_credentials",
    {
      house_id: houseId,
      provider,
      model,
      key_last4: plaintext.slice(-4),
      status: shape.status,
      last_verified_at: shape.lastVerifiedAt(),
      last_error: shape.lastError ?? null,
      capabilities,
      // `created_by` here is the account, not the membership — this table
      // references `users` rather than `house_members`.
      created_by: accountIds.get(home.roster[0].username),
      ...(await seal(plaintext, houseId, master)),
    },
    "house_id",
  );

}
