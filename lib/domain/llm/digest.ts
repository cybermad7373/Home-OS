import type { JsonSchema } from "@/lib/infra/llm/types";

/**
 * Call site 2 — the weekly fairness digest. docs/10-LLM-SPEC.md section 6.
 *
 * The leaderboard shows numbers. The digest turns them into the sentence that
 * gets read out in the house group chat, and that sentence is the product's
 * social mechanism. The deterministic version below is less readable than the
 * model's and is never wrong, which is why it stays the fallback rather than
 * being deleted once the model works.
 */

export const DIGEST_SYSTEM_PROMPT = `You write a short weekly summary for a shared house that tracks who does the
chores. Your reader is the whole house, including the people who did the least.

Write 3 to 5 sentences. Be factual and specific — use the actual numbers.

Name who carried the most work and who did the least. Do not soften it, and do
not editorialise about it either. State what happened and what changes next
week. No moralising, no exclamation marks, no praise beyond stating the facts.

If someone improved on last week, say so — even if they are still last.

Then state, in one sentence, what next week's schedule does differently and why.

Return only JSON matching the schema.`;

export const DIGEST_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["summary", "highlights", "next_week_note"],
  additionalProperties: false,
  properties: {
    summary: { type: "string", maxLength: 800 },
    highlights: {
      type: "object",
      required: ["carried", "coasted", "improved"],
      properties: {
        carried: { type: "array", items: { type: "string" }, maxItems: 3 },
        coasted: { type: "array", items: { type: "string" }, maxItems: 3 },
        improved: { type: "array", items: { type: "string" }, maxItems: 3 },
      },
    },
    next_week_note: { type: "string", maxLength: 300 },
  },
};

export const DIGEST_TEMPERATURE = 0.6;
export const DIGEST_MAX_TOKENS = 800;
export const SUMMARY_MIN_LENGTH = 80;
export const SUMMARY_MAX_LENGTH = 800;

export interface DigestMember {
  memberId: string;
  displayName: string;
  earned: number;
  target: number;
  done: number;
  missed: number;
  lastWeekEarned: number;
}

export interface DigestInput {
  weekStart: string;
  weekEnd: string;
  members: DigestMember[];
  nextWeek: { memberId: string; newTarget: number; note: string }[];
  lastWeekTop3Share?: number;
}

export interface DigestResponse {
  summary: string;
  highlights: { carried: string[]; coasted: string[]; improved: string[] };
  next_week_note: string;
}

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0].slice(0, 20);
}

export function top3Share(members: DigestMember[]): number {
  const total = members.reduce((sum, member) => sum + member.earned, 0);
  if (total === 0) return 0;
  const top = [...members]
    .sort((a, b) => b.earned - a.earned)
    .slice(0, 3)
    .reduce((sum, member) => sum + member.earned, 0);
  return Math.round((top / total) * 100) / 100;
}

export function completionRate(members: DigestMember[]): number {
  const assigned = members.reduce((sum, member) => sum + member.done + member.missed, 0);
  if (assigned === 0) return 0;
  const done = members.reduce((sum, member) => sum + member.done, 0);
  return Math.round((done / assigned) * 100) / 100;
}

/** Section 6.2. First names, points and counts. No ids, no money, no free text. */
export function buildDigestPayload(input: DigestInput): Record<string, unknown> {
  const names = new Map(input.members.map((m, i) => [m.memberId, `m${i + 1}`]));

  return {
    week: `${input.weekStart} to ${input.weekEnd}`,
    members: input.members.map((member) => ({
      id: names.get(member.memberId),
      name: firstNameOf(member.displayName),
      earned: member.earned,
      target: member.target,
      done: member.done,
      missed: member.missed,
      last_week_earned: member.lastWeekEarned,
    })),
    house: {
      total_points: input.members.reduce((sum, member) => sum + member.earned, 0),
      completion_rate: completionRate(input.members),
      top3_share: top3Share(input.members),
      top3_share_last_week: input.lastWeekTop3Share ?? null,
    },
    next_week: input.nextWeek.map((entry) => ({
      id: names.get(entry.memberId),
      name: firstNameOf(
        input.members.find((m) => m.memberId === entry.memberId)?.displayName ?? "Someone",
      ),
      new_target: entry.newTarget,
      note: entry.note,
    })),
  };
}

/**
 * Section 6.4 — lighter than the schedule's, because a digest cannot corrupt
 * state. What it does catch is the two ways a summary lies: a name nobody in
 * the house has, and a number nobody earned.
 */
export function validateDigest(
  response: DigestResponse,
  input: DigestInput,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const known = new Set(input.members.map((member) => firstNameOf(member.displayName)));

  for (const group of ["carried", "coasted", "improved"] as const) {
    for (const name of response.highlights[group] ?? []) {
      if (!known.has(name.trim())) errors.push(`UNKNOWN_NAME:${group}:${name}`);
    }
  }

  const length = response.summary.trim().length;
  if (length < SUMMARY_MIN_LENGTH) errors.push(`SUMMARY_TOO_SHORT:${length}`);
  if (length > SUMMARY_MAX_LENGTH) errors.push(`SUMMARY_TOO_LONG:${length}`);

  // A cheap guard against invented statistics: every digit run in the prose has
  // to be a number that was actually supplied.
  const supplied = numbersIn(buildDigestPayload(input));
  for (const number of response.summary.match(/\d+/g) ?? []) {
    if (!supplied.has(number)) errors.push(`INVENTED_NUMBER:${number}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Every number the payload contains, as strings, including the ones a writer
 * would reasonably derive: a rate of 0.79 read aloud is "79 per cent", and a
 * date is four digits and two and two.
 */
function numbersIn(payload: unknown): Set<string> {
  const found = new Set<string>();

  const walk = (value: unknown): void => {
    if (typeof value === "number") {
      found.add(String(value));
      found.add(String(Math.round(value)));
      found.add(String(Math.round(value * 100)));
      for (const digits of String(value).match(/\d+/g) ?? []) found.add(digits);
      return;
    }
    if (typeof value === "string") {
      for (const digits of value.match(/\d+/g) ?? []) {
        found.add(digits);
        found.add(String(Number(digits)));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };

  walk(payload);
  return found;
}

/**
 * Section 6.5 — the deterministic digest, used verbatim when no key is present
 * and whenever the model's version is rejected.
 */
export function buildTemplateDigest(input: DigestInput): DigestResponse {
  const ranked = [...input.members].sort((a, b) => b.earned - a.earned);
  const completion = Math.round(completionRate(input.members) * 100);
  const share = Math.round(top3Share(input.members) * 100);
  const lastShare =
    input.lastWeekTop3Share === undefined
      ? null
      : Math.round(input.lastWeekTop3Share * 100);

  const top = ranked.slice(0, 3);
  const topLine = top
    .map((member) => `${firstNameOf(member.displayName)} (${member.earned} pts)`)
    .join(", ");

  const sentences = [
    `Week of ${input.weekStart} to ${input.weekEnd}. The house completed ${completion}% of assigned chores.`,
  ];

  if (top.length > 0) {
    sentences.push(
      lastShare === null
        ? `${topLine} earned ${share}% of the week's points between them.`
        : `${topLine} earned ${share}% of the week's points between them — ${
            share === lastShare ? "the same as" : share < lastShare ? "down from" : "up from"
          } ${lastShare}% last week.`,
    );
  }

  const behind = ranked.filter((member) => member.earned < member.target);
  const last = ranked[ranked.length - 1];
  if (last && behind.length > 0) {
    sentences.push(
      `${firstNameOf(last.displayName)} earned ${last.earned} of a ${last.target} target and missed ${last.missed} chores.`,
    );
  }

  const nextWeekNote =
    input.nextWeek.length > 0
      ? input.nextWeek
          .map((entry) => {
            const member = input.members.find((m) => m.memberId === entry.memberId);
            return `${firstNameOf(member?.displayName ?? "Someone")}'s target rises to ${entry.newTarget} points to clear the deficit.`;
          })
          .join(" ")
      : "Next week's targets are unchanged.";

  return {
    summary: sentences.join(" "),
    highlights: {
      carried: top.map((member) => firstNameOf(member.displayName)),
      coasted: behind.slice(-2).map((member) => firstNameOf(member.displayName)),
      improved: ranked
        .filter((member) => member.earned > member.lastWeekEarned)
        .slice(0, 3)
        .map((member) => firstNameOf(member.displayName)),
    },
    next_week_note: nextWeekNote,
  };
}
