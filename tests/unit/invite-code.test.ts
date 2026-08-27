import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  INVITE_ALPHABET,
  formatInviteCode,
  isValidInviteCode,
  normaliseInviteCode,
} from "@/lib/utils/invite-code";

/** BR-008 — six characters, no ambiguous glyphs, displayed as XXX-XXX. */
describe("invite codes", () => {
  it("excludes the glyphs people mistype", () => {
    for (const character of "O0I1") {
      expect(INVITE_ALPHABET).not.toContain(character);
    }
  });

  it("normalises case and formatting", () => {
    expect(normaliseInviteCode("hn4-k2p")).toBe("HN4K2P");
    expect(normaliseInviteCode(" hn4 k2p ")).toBe("HN4K2P");
  });

  it("accepts a well-formed code however it was typed", () => {
    expect(isValidInviteCode("HN4K2P")).toBe(true);
    expect(isValidInviteCode("hn4-k2p")).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidInviteCode("HN4K2")).toBe(false);
    expect(isValidInviteCode("HN4K2PX")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    expect(isValidInviteCode("HN4K2O")).toBe(false);
    expect(isValidInviteCode("HN4K21")).toBe(false);
  });

  it("displays as XXX-XXX", () => {
    expect(formatInviteCode("HN4K2P")).toBe("HN4-K2P");
    expect(formatInviteCode("HN")).toBe("HN");
  });

  it("accepts every code the alphabet can produce", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...INVITE_ALPHABET.split("")), {
          minLength: 6,
          maxLength: 6,
        }),
        (characters) => {
          expect(isValidInviteCode(characters.join(""))).toBe(true);
        },
      ),
    );
  });
});
