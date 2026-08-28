/**
 * What an absence would cost the Home — docs/01-BRD.md AV-08.
 *
 * "An absence request against a published week shows exactly which chores and
 * how many points are affected before it is submitted." That sentence is the
 * whole of this module. It is pure and lives here rather than in the route
 * handler because the same arithmetic is shown twice — once in the preview
 * sheet, once in the decision the Home is asked to approve — and the two must
 * not be able to drift.
 *
 * Framework- and database-free by design: it takes the assignments somebody
 * else read and returns numbers.
 */

/** The slice of a chore assignment the preview needs, and nothing else. */
export interface AbsenceAffectedChore {
  assignmentId: string;
  date: string;
  name: string;
  slot: "morning" | "evening" | "any";
  effortPoints: number;
  /** Only `assigned` work moves. The rest is shown so the total is honest. */
  status: string;
}

export interface AbsenceImpact {
  /** Days covered, inclusive of both ends. */
  days: number;
  /** Work that would be taken off the absent member. */
  moving: AbsenceAffectedChore[];
  /** Points that would leave their week with it. */
  movingPoints: number;
  /**
   * Work on those days that stays where it is: already done, waiting on a
   * peer, confirmed, missed. Shown because a member looking at this screen is
   * asking "what happens to my chores", and "nothing, they are already done"
   * is one of the answers.
   */
  settled: AbsenceAffectedChore[];
  /**
   * Guest work, which never moves: HC-7 makes the host the only person who may
   * do it, so the only place it could go is a pool nobody may claim from. A
   * member going away cancels the guest instead, which removes the work.
   */
  guestChores: AbsenceAffectedChore[];
}

/** The statuses that are still somebody's to do, and so still movable. */
const MOVABLE = new Set(["assigned"]);

/**
 * Every date in an inclusive range, as ISO days.
 *
 * Noon UTC on purpose: a date built at midnight and stepped by a day lands on
 * the previous day in any timezone west of UTC once a DST boundary is crossed,
 * and this range is compared against `chore_date`, which is a plain date.
 */
export function absenceDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function absenceImpact(
  from: string,
  to: string,
  chores: (AbsenceAffectedChore & { isGuestChore: boolean })[],
): AbsenceImpact {
  const days = absenceDates(from, to).length;
  const moving: AbsenceAffectedChore[] = [];
  const settled: AbsenceAffectedChore[] = [];
  const guestChores: AbsenceAffectedChore[] = [];

  for (const chore of chores) {
    const { isGuestChore, ...rest } = chore;
    if (isGuestChore) guestChores.push(rest);
    else if (MOVABLE.has(chore.status)) moving.push(rest);
    else settled.push(rest);
  }

  return {
    days,
    moving,
    movingPoints: moving.reduce((total, chore) => total + chore.effortPoints, 0),
    settled,
    guestChores,
  };
}

/**
 * The sentence the sheet leads with.
 *
 * Written here rather than in JSX so that the one case that matters — an
 * absence with no consequences at all, which is most of them — is a tested
 * branch rather than a ternary somebody edits later.
 */
export function impactPhrase(impact: AbsenceImpact): string {
  const dayWord = impact.days === 1 ? "1 day" : `${impact.days} days`;

  if (impact.moving.length === 0) {
    return `${dayWord}. Nothing is assigned to you on ${
      impact.days === 1 ? "that day" : "those days"
    } yet, so nothing moves.`;
  }

  const choreWord =
    impact.moving.length === 1 ? "1 chore" : `${impact.moving.length} chores`;

  return `${dayWord}. ${choreWord} worth ${impact.movingPoints} point${
    impact.movingPoints === 1 ? "" : "s"
  } would move to somebody else, and your target for the week drops with them.`;
}
