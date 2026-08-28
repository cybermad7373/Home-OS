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
  houseCounts.clear();
}

/**
 * The per-Home caps — docs/05-API-SPEC.md section 15.
 *
 * Rule parsing is twenty per Home per day rather than per member, and food
 * ideas will be ten. The unit differs from call site 3 on purpose: a rule is a
 * thing the Home writes once and argues about, so a cap that scales with the
 * number of people would make a bigger Home able to spend more of a free tier
 * on the same six rules.
 */
export const RULE_PARSE_CAP_PER_DAY = 20;

const houseCounts = new Map<string, { day: string; used: number }>();

function key(houseId: string, purpose: string): string {
  return `${purpose}:${houseId}`;
}

export function houseCallsUsed(houseId: string, purpose: string, day: string): number {
  const entry = houseCounts.get(key(houseId, purpose));
  return entry && entry.day === day ? entry.used : 0;
}

export function underHouseCap(
  houseId: string,
  purpose: string,
  day: string,
  cap: number,
): boolean {
  return houseCallsUsed(houseId, purpose, day) < cap;
}

export function countHouseCall(houseId: string, purpose: string, day: string): void {
  const used = houseCallsUsed(houseId, purpose, day);
  houseCounts.set(key(houseId, purpose), { day, used: used + 1 });
}
