import { PRIORITY, entryFor, type NotificationType, type Priority } from "./catalogue";

/**
 * Volume control — docs/11-NOTIFICATIONS-SPEC.md section 5.
 *
 * "The limits that keep the app installed." Six pushes per member per day; the
 * seventh and everything after it is folded into one coalesced digest rather
 * than sent. Priority decides which six survive, not arrival order, so a
 * settlement never loses its place to four chore reminders that queued ahead
 * of it.
 *
 * Every rule here is pure and works on a list of candidates. The dispatcher
 * supplies the list and performs the sends; this file decides what the list
 * turns into.
 */

export const MAX_PUSH_PER_DAY = 6;
export const MAX_REMINDERS_PER_CHORE = 2;
export const MAX_ESCALATIONS_PER_MEMBER_PER_DAY = 1;
export const DUPLICATE_WINDOW_MIN = 10;

export interface Candidate {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string | null;
  /** Push collapse key. A repeat within the window replaces rather than adds. */
  tag: string;
  /** Minutes since an arbitrary epoch. Only differences matter. */
  scheduledForMin: number;
  /**
   * When the thing being reminded about starts, for the "due within the hour"
   * promotion in the priority list. Null for everything that is not a reminder.
   */
  windowStartMin?: number | null;
}

/**
 * The effective priority of one candidate at one instant.
 *
 * A chore reminder is only high priority while it is *imminent*. The same
 * reminder scheduled for tomorrow evening sorts with everything else, which is
 * the difference between "you have twenty minutes" and "sometime this week".
 */
export function effectivePriority(candidate: Candidate, nowMin: number): Priority {
  const base = entryFor(candidate.type).priority;
  if (base !== PRIORITY.OTHER) return base;

  const isReminder = candidate.type === "N-02" || candidate.type === "N-03";
  if (!isReminder) return base;

  const start = candidate.windowStartMin;
  if (start === null || start === undefined) return base;
  return start - nowMin <= 60 ? PRIORITY.IMMINENT_REMINDER : PRIORITY.OTHER;
}

/**
 * Duplicate suppression: the same tag within ten minutes replaces rather than
 * adds. The later scheduled row is the one kept, because it carries the fresher
 * numbers — a second reminder knows the deadline moved, the first does not.
 */
export function collapseByTag(candidates: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];

  for (const candidate of [...candidates].sort((a, b) => a.scheduledForMin - b.scheduledForMin)) {
    const clashIndex = kept.findIndex(
      (existing) =>
        existing.tag === candidate.tag &&
        Math.abs(existing.scheduledForMin - candidate.scheduledForMin) < DUPLICATE_WINDOW_MIN,
    );
    if (clashIndex === -1) {
      kept.push(candidate);
    } else {
      kept[clashIndex] = candidate;
    }
  }

  return kept;
}

export interface CoalescedDigest {
  title: string;
  body: string;
  deepLink: string;
  tag: string;
  /** The candidates it stands in for. They still get their feed rows. */
  folded: Candidate[];
}

export interface Allocation {
  /** Sent individually, in the order given. */
  push: Candidate[];
  /** One digest standing in for the overflow, or null when nothing overflowed. */
  digest: CoalescedDigest | null;
  /**
   * Everything not pushed individually. These still get their feed rows — the
   * feed is the record — and the digest, where there is one, stands in for them
   * on the device.
   */
  folded: Candidate[];
}

/**
 * Splits the due candidates into what is pushed and what is folded away.
 *
 * `alreadySentToday` is the count already delivered to this member today, so a
 * dispatcher run at 20:00 respects what the 09:00 run already spent.
 */
export function allocate(
  candidates: Candidate[],
  nowMin: number,
  alreadySentToday: number,
): Allocation {
  const collapsed = collapseByTag(candidates);

  const ordered = [...collapsed].sort((a, b) => {
    const byPriority = effectivePriority(a, nowMin) - effectivePriority(b, nowMin);
    if (byPriority !== 0) return byPriority;
    return a.scheduledForMin - b.scheduledForMin;
  });

  const remaining = Math.max(0, MAX_PUSH_PER_DAY - alreadySentToday);

  // The cap counts the digest itself. Sending six and then a seventh saying
  // "and three more" would be seven, which is the number the rule exists to
  // prevent — so when there is an overflow, only five go individually.
  if (ordered.length <= remaining) {
    return { push: ordered, digest: null, folded: [] };
  }

  // A member who has already had six today gets nothing more, not even a digest
  // saying so. The seventh push is the seventh push whatever it contains.
  if (remaining === 0) {
    return { push: [], digest: null, folded: ordered };
  }

  const individual = remaining - 1;
  const push = ordered.slice(0, individual);
  const folded = ordered.slice(individual);

  return { push, digest: digestFor(folded), folded };
}

/** The "3 things need you" fallback of section 5, linking to the feed. */
export function digestFor(folded: Candidate[]): CoalescedDigest {
  const count = folded.length;
  const noun = count === 1 ? "thing needs" : "things need";
  const preview = folded
    .slice(0, 3)
    .map((candidate) => candidate.title)
    .join(" · ");

  return {
    title: `${count} ${noun} you`,
    body: preview,
    deepLink: "/notifications",
    tag: "coalesced-digest",
    folded,
  };
}

/**
 * Section 5: at most one house-feed escalation per member per day, however many
 * chores they missed. Keeps the sharpest notification in the product from
 * becoming a pile-on.
 */
export function limitEscalations<T extends { subjectMemberId: string }>(
  escalations: T[],
  alreadyToday: ReadonlyMap<string, number>,
): T[] {
  const used = new Map(alreadyToday);
  const kept: T[] = [];

  for (const escalation of escalations) {
    const count = used.get(escalation.subjectMemberId) ?? 0;
    if (count >= MAX_ESCALATIONS_PER_MEMBER_PER_DAY) continue;
    used.set(escalation.subjectMemberId, count + 1);
    kept.push(escalation);
  }

  return kept;
}
