/**
 * The redaction contract — docs/10-LLM-SPEC.md section 4.
 *
 * This module is the only permitted construction path for LLM input. Nothing
 * else builds a payload, because the guarantee the house is given is not "we
 * try to strip identifiers" but "the payload is built by one function that
 * cannot emit them".
 *
 * Permitted: opaque ids (`m1`, `R2`), first names, points, chore names, dates,
 * times, aggregate rupee totals.
 * Forbidden, unconditionally: emails, phone numbers, UPI ids, surnames,
 * database UUIDs, expense descriptions, the house name or address, and any free
 * text a member typed — except a chore rejection reason in the digest, cut at
 * 100 characters.
 */

export interface LlmMemberSource {
  memberId: string;
  displayName: string;
}

export interface LlmMember {
  id: string;
  name: string;
}

const NAME_LIMIT = 20;
export const REJECTION_REASON_LIMIT = 100;

/** First name only, cut at twenty characters. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0].slice(0, NAME_LIMIT);
}

export function toLlmMember(member: LlmMemberSource, index: number): LlmMember {
  return { id: `m${index + 1}`, name: firstName(member.displayName) };
}

/**
 * The local mapping between database ids and the opaque ids the model sees.
 *
 * Both directions are needed: outward so no UUID is ever sent, and back so a
 * proposal naming `m3` can be resolved to a member without trusting the model
 * to have echoed an id we recognise.
 */
export class OpaqueIds {
  private readonly toOpaque = new Map<string, string>();
  private readonly toReal = new Map<string, string>();

  constructor(private readonly prefix: string) {}

  opaque(realId: string): string {
    const existing = this.toOpaque.get(realId);
    if (existing) return existing;
    const next = `${this.prefix}${this.toOpaque.size + 1}`;
    this.toOpaque.set(realId, next);
    this.toReal.set(next, realId);
    return next;
  }

  real(opaqueId: string): string | undefined {
    return this.toReal.get(opaqueId);
  }

  get size(): number {
    return this.toOpaque.size;
  }
}

export function truncateReason(reason: string | null | undefined): string | undefined {
  if (!reason) return undefined;
  const trimmed = reason.trim();
  if (trimmed === "") return undefined;
  return trimmed.length > REJECTION_REASON_LIMIT
    ? `${trimmed.slice(0, REJECTION_REASON_LIMIT - 1)}…`
    : trimmed;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL = /[^\s@]+@[^\s@]+/;
const LONG_NUMBER = /\b\d{10,}\b/;

/**
 * The assertion behind the redaction test in section 10, exported so the test
 * and the payload builders share one definition of "leaked".
 */
export function findForbidden(payload: unknown): string[] {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
  const found: string[] = [];
  if (UUID.test(text)) found.push("uuid");
  if (EMAIL.test(text)) found.push("email");
  if (LONG_NUMBER.test(text)) found.push("long number");
  return found;
}
