import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SealingUnavailableError,
  currentKeyVersion,
  fromPgBytea,
  keyLast4,
  openKey,
  sealKey,
  sealingAvailable,
  toPgBytea,
} from "@/lib/infra/llm/crypto";

/**
 * Sealing — docs/10-LLM-SPEC.md sections 3.3 and 10.
 *
 * Four claims are tested because four claims are made to the house: a key is
 * stored encrypted, it cannot be lifted into another house's row, rotation does
 * not break what is already stored, and a server with no master key refuses to
 * store rather than falling back to plaintext.
 */

const KEY_V1 = "PmJ8CFzVV5FtEmLn7rpgJRKOIdOEWxMb+wcvLEfvsr8=";
const KEY_V2 = "GmipGGgMDu2iT/hWIh14n89Gj73PUOnsfpSS2ux61no=";

const HOUSE_A = "11111111-1111-4111-8111-111111111111";
const HOUSE_B = "22222222-2222-4222-8222-222222222222";

const original = { ...process.env };

beforeEach(() => {
  process.env.LLM_KEY_ENCRYPTION_KEY = KEY_V1;
  delete process.env.LLM_KEY_ENCRYPTION_KEY_V2;
  delete process.env.LLM_KEY_ENCRYPTION_KEY_VERSION;
});

afterEach(() => {
  process.env = { ...original };
});

describe("seal and open", () => {
  it("returns the same key it was given", async () => {
    const sealed = await sealKey("gsk_secret_provider_key", HOUSE_A);
    expect(await openKey(sealed, HOUSE_A)).toBe("gsk_secret_provider_key");
  });

  it("stores nothing that looks like the key", async () => {
    const sealed = await sealKey("gsk_secret_provider_key", HOUSE_A);
    const stored = `${toPgBytea(sealed.ciphertext)}${toPgBytea(sealed.iv)}${toPgBytea(sealed.tag)}`;
    expect(stored).not.toContain("gsk_");
    expect(stored).not.toContain("secret");
  });

  it("uses a fresh nonce for every write", async () => {
    const first = await sealKey("gsk_secret_provider_key", HOUSE_A);
    const second = await sealKey("gsk_secret_provider_key", HOUSE_A);
    expect(toPgBytea(first.iv)).not.toBe(toPgBytea(second.iv));
    expect(toPgBytea(first.ciphertext)).not.toBe(toPgBytea(second.ciphertext));
  });

  it("refuses to open a ciphertext lifted into another house's row", async () => {
    const sealed = await sealKey("gsk_secret_provider_key", HOUSE_A);
    await expect(openKey(sealed, HOUSE_B)).rejects.toThrow();
  });

  it("survives the round trip through Postgres' bytea hex form", async () => {
    const sealed = await sealKey("gsk_secret_provider_key", HOUSE_A);
    const reread = {
      ciphertext: fromPgBytea(toPgBytea(sealed.ciphertext)),
      iv: fromPgBytea(toPgBytea(sealed.iv)),
      tag: fromPgBytea(toPgBytea(sealed.tag)),
      version: sealed.version,
    };
    expect(await openKey(reread, HOUSE_A)).toBe("gsk_secret_provider_key");
  });
});

describe("rotation", () => {
  it("keeps opening version 1 after version 2 becomes the write key", async () => {
    const old = await sealKey("gsk_old_key", HOUSE_A);
    expect(old.version).toBe(1);

    process.env.LLM_KEY_ENCRYPTION_KEY_V2 = KEY_V2;
    process.env.LLM_KEY_ENCRYPTION_KEY_VERSION = "2";

    const fresh = await sealKey("gsk_new_key", HOUSE_A);
    expect(currentKeyVersion()).toBe(2);
    expect(fresh.version).toBe(2);

    expect(await openKey(fresh, HOUSE_A)).toBe("gsk_new_key");
    expect(await openKey(old, HOUSE_A)).toBe("gsk_old_key");
  });

  it("fails rather than guessing when a version's master key is gone", async () => {
    const sealed = await sealKey("gsk_old_key", HOUSE_A);
    await expect(openKey({ ...sealed, version: 3 }, HOUSE_A)).rejects.toBeInstanceOf(
      SealingUnavailableError,
    );
  });
});

describe("with no master key", () => {
  it("reports sealing as unavailable", () => {
    delete process.env.LLM_KEY_ENCRYPTION_KEY;
    expect(sealingAvailable()).toBe(false);
  });

  it("refuses to seal, and never returns plaintext instead", async () => {
    delete process.env.LLM_KEY_ENCRYPTION_KEY;
    await expect(sealKey("gsk_secret_provider_key", HOUSE_A)).rejects.toBeInstanceOf(
      SealingUnavailableError,
    );
  });

  it("refuses a master key that is not 32 bytes", async () => {
    process.env.LLM_KEY_ENCRYPTION_KEY = "dG9vc2hvcnQ=";
    await expect(sealKey("gsk_secret_provider_key", HOUSE_A)).rejects.toBeInstanceOf(
      SealingUnavailableError,
    );
  });
});

describe("what the UI is given", () => {
  it("is four characters and nothing more", () => {
    expect(keyLast4("gsk_abcdefgh4f2a")).toBe("4f2a");
  });
});
