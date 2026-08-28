/**
 * The vocabulary the scheduler works in.
 *
 * Everything here is plain data. No database rows, no Supabase types, no dates
 * as Date objects — ISO strings and minutes-since-midnight, so the whole engine
 * can be exercised from a test file with nothing running.
 */

export type ChoreSlot = "morning" | "evening" | "any";
export type ChoreScope = "house" | "room";
export type ChoreFrequency = "daily" | "weekly" | "times_per_week";
export type WindowKind = "full" | "morning" | "evening";

/** docs/06-ALGORITHMS.md section 1.2. House-configurable later; fixed for now. */
export const DAY_START_MIN = 6 * 60; // 06:00
export const DAY_END_MIN = 23 * 60; // 23:00
export const MIN_BUFFER_MIN = 15;

/** HC-6 — nobody gets more than this on one day, however far behind they are. */
export const MAX_INSTANCES_PER_DAY = 3;
export const MAX_MINUTES_PER_DAY = 150;

export interface ChoreTemplate {
  id: string;
  name: string;
  effortPoints: number;
  durationMin: number;
  slot: ChoreSlot;
  scope: ChoreScope;
  roomId: string | null;
  frequency: ChoreFrequency;
  timesPerWeek: number | null;
  requiresCookingSkill: boolean;
  isHeavy: boolean;
}

/** One concrete chore, on one date. What the solver assigns. */
export interface ChoreInstance {
  /** Stable within a run: `${templateId}:${date}:${occurrence}`. */
  id: string;
  templateId: string;
  name: string;
  choreDate: string;
  slot: ChoreSlot;
  effortPoints: number;
  durationMin: number;
  scope: ChoreScope;
  roomId: string | null;
  requiresCookingSkill: boolean;
  isHeavy: boolean;
  /**
   * Set when this instance exists because a guest is staying. HC-7 restricts it
   * to that guest's host: the guest cannot use the app, and the point of
   * registering one is that the extra work lands on the person who invited
   * them rather than on the house.
   */
  guestId?: string;
  hostMemberId?: string;
}

export interface SchedulingMember {
  memberId: string;
  canCook: boolean;
  /** Room occupancy on the week in question, for room-scoped chores. */
  roomId: string | null;
  residency: "full_time" | "weekday_only" | "weekend_only";
  joinedDate: string;
  leftDate: string | null;
}

/** Minutes since midnight, half-open [start, end). */
export interface AvailabilityWindow {
  kind: WindowKind;
  startMin: number;
  endMin: number;
}

/** What a member's week looks like: date -> the windows they are home. */
export type WeekWindows = Map<string, AvailabilityWindow[]>;

export interface Assignment {
  instanceId: string;
  memberId: string | null; // null means it went to the open pool
  /** Other memberIds who share this assignment (CE-11). */
  sharedWith?: string[];
}

export interface SolveResult {
  assignments: Assignment[];
  /** Instances nobody could legally take. Never silently dropped. */
  openInstanceIds: string[];
  pointsByMember: Map<string, number>;
  maxDeviation: number;
}
