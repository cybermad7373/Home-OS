/**
 * The parse cap — docs/10-LLM-SPEC.md section 8.
 *
 * Twenty parses per member per day. The limit is per member rather than per
 * house so that one person's typing cannot spend the house's whole
 * per-minute budget on a free tier.
 *
 * Per process and in memory, like the circuit breaker and for the same reason:
 * it is a spend guard rather than a correctness one, the cost of a miscount is
 * a handful of extra 300-token calls, and the alternative — a row per keystroke
 * — buys accuracy nobody needs.
 */

export const PARSE_CAP_PER_DAY = 20;

const counts = new Map<string, { day: string; used: number }>();

export function parsesUsed(memberId: string, day: string): number {
  const entry = counts.get(memberId);
  return entry && entry.day === day ? entry.used : 0;
}

export function underParseCap(memberId: string, day: string): boolean {
  return parsesUsed(memberId, day) < PARSE_CAP_PER_DAY;
}

export function countParse(memberId: string, day: string): void {
  const used = parsesUsed(memberId, day);
  counts.set(memberId, { day, used: used + 1 });
}

export function resetParseCounts(): void {
  counts.clear();
}
