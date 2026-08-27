/**
 * BR-008 — an invite code is six characters from an alphabet with no O, 0, I or
 * 1, displayed as `XXX-XXX`. The database generates them; these helpers are the
 * client-side half, so a mistyped code fails before it costs a round trip.
 */

export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Strips formatting and uppercases: "hn4-k2p" -> "HN4K2P". */
export function normaliseInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidInviteCode(input: string): boolean {
  const code = normaliseInviteCode(input);
  if (code.length !== 6) return false;
  return [...code].every((character) => INVITE_ALPHABET.includes(character));
}

/** Display form: "HN4K2P" -> "HN4-K2P". */
export function formatInviteCode(input: string): string {
  const code = normaliseInviteCode(input);
  if (code.length <= 3) return code;
  return `${code.slice(0, 3)}-${code.slice(3, 6)}`;
}
