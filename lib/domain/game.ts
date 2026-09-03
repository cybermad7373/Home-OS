/**
 * The game layer, computed from records the house already has.
 *
 * There is no streaks table, no badges table and no game-points column, and
 * this file is the reason there does not need to be one. A streak is a fact
 * about which days a member has a confirmed chore on; game points are the
 * effort points those chores were worth. Both are already in
 * `chore_assignments`, so storing them again would create a second copy of the
 * truth that could disagree with the first.
 *
 * The screen this feeds used to render `member.id.split("").reduce(...) % 500`
 * — a number derived from the letters of a UUID, shown to members as their
 * progress. Everything here is derived from confirmed work instead.
 *
 * Pure: no database, no clock. The caller passes the day it is in the house's
 * timezone, because "is the streak still alive" is a question about the house's
 * date and not the server's.
 */

/** One confirmed chore: the day it was for, and what it was worth. */
export interface ConfirmedChore {
  memberId: string;
  /** `YYYY-MM-DD`, the house's date. */
  choreDate: string;
  points: number;
}

export interface GameStanding {
  memberId: string;
  /** Effort points from confirmed chores. */
  points: number;
  /** Days in a row up to and including today, or yesterday if today is not done yet. */
  currentStreak: number;
  /** The longest run of consecutive days this member has ever had. */
  bestStreak: number;
  /** Distinct days with at least one confirmed chore. */
  activeDays: number;
  /** The most recent day with a confirmed chore, or null for a member with none. */
  lastActiveDate: string | null;
}

export interface BadgeDefinition {
  key: string;
  name: string;
  requirement: string;
  /** Answers "has this member earned it", from their standing. */
  earned: (standing: GameStanding) => boolean;
}

/**
 * The badge set.
 *
 * Every one of them is a threshold on a figure computed above, which is the
 * only kind of badge this product can honestly award: a badge nobody can trace
 * back to work they did is a sticker.
 */
export const BADGES: readonly BadgeDefinition[] = [
  {
    key: "first",
    name: "First win",
    requirement: "One confirmed chore",
    earned: (standing) => standing.activeDays >= 1,
  },
  {
    key: "week",
    name: "Week warrior",
    requirement: "Seven days in a row",
    earned: (standing) => standing.bestStreak >= 7,
  },
  {
    key: "century",
    name: "Century",
    requirement: "100 points",
    earned: (standing) => standing.points >= 100,
  },
  {
    key: "regular",
    name: "Regular",
    requirement: "Thirty active days",
    earned: (standing) => standing.activeDays >= 30,
  },
  {
    key: "marathon",
    name: "Marathon",
    requirement: "Thirty days in a row",
    earned: (standing) => standing.bestStreak >= 30,
  },
  {
    key: "five-hundred",
    name: "Star",
    requirement: "500 points",
    earned: (standing) => standing.points >= 500,
  },
] as const;

/** `YYYY-MM-DD` a day earlier, without touching a timezone. */
function previousDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  // Noon UTC, so a day step can never land on the wrong side of a boundary.
  const at = new Date(Date.UTC(year, month - 1, day, 12));
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/**
 * The standing for one member.
 *
 * A day counts once however many chores were confirmed on it: doing four things
 * on Sunday is not a four-day streak, and a member who believes otherwise will
 * find out at exactly the wrong moment.
 *
 * The current streak is allowed to end *yesterday* rather than today, because
 * a day is not over yet at nine in the morning and a streak that resets every
 * midnight is a streak nobody can hold.
 */
export function standingFor(
  memberId: string,
  chores: readonly ConfirmedChore[],
  today: string,
): GameStanding {
  const mine = chores.filter((chore) => chore.memberId === memberId);

  const points = mine.reduce((total, chore) => total + chore.points, 0);
  const days = [...new Set(mine.map((chore) => chore.choreDate))].sort();

  if (days.length === 0) {
    return {
      memberId,
      points: 0,
      currentStreak: 0,
      bestStreak: 0,
      activeDays: 0,
      lastActiveDate: null,
    };
  }

  let bestStreak = 1;
  let run = 1;
  for (let index = 1; index < days.length; index += 1) {
    run = days[index] === nextDay(days[index - 1]) ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }

  const lastActiveDate = days[days.length - 1];
  const yesterday = previousDay(today);

  // A streak that ended before yesterday is over, and saying so is the point of
  // having one.
  let currentStreak = 0;
  if (lastActiveDate === today || lastActiveDate === yesterday) {
    currentStreak = 1;
    for (let index = days.length - 1; index > 0; index -= 1) {
      if (days[index - 1] !== previousDay(days[index])) break;
      currentStreak += 1;
    }
  }

  return {
    memberId,
    points,
    currentStreak,
    bestStreak,
    activeDays: days.length,
    lastActiveDate,
  };
}

function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const at = new Date(Date.UTC(year, month - 1, day, 12));
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

/** Every member's standing, in the order the members were given. */
export function buildStandings(
  memberIds: readonly string[],
  chores: readonly ConfirmedChore[],
  today: string,
): GameStanding[] {
  return memberIds.map((memberId) => standingFor(memberId, chores, today));
}

/** Which badges a standing has earned, and which it has not. */
export function badgesFor(
  standing: GameStanding,
): Array<{ key: string; name: string; requirement: string; earned: boolean }> {
  return BADGES.map((badge) => ({
    key: badge.key,
    name: badge.name,
    requirement: badge.requirement,
    earned: badge.earned(standing),
  }));
}
