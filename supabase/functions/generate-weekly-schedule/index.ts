// Edge function: generate-weekly-schedule
//
// Runs Sunday evening (pg_cron, migration 029), after close-effort-week has
// written the carry figures the targets depend on. For every house it expands
// the active templates into next week's instances, computes each member's
// target, solves the assignment, and publishes the week.
//
// Idempotent (NFR-11): publishing replaces only the outstanding rows for the
// week, so a second run rewrites the same plan and never disturbs work that has
// already been done, confirmed or missed.
//
// The scheduling logic here mirrors lib/domain/scheduling/ and
// lib/domain/fairness/targets.ts. The two are deliberately separate copies
// rather than a shared package, for the reason recorded in DECISIONS.md D-06:
// Deno and Next.js do not share a module graph on the free tier, and the
// alternative — the job calling back into the app over HTTP — would make a
// scheduled database task depend on the web tier being awake. Both copies are
// held to the worked examples in docs/06-ALGORITHMS.md.
//
// Availability, exceptions and guests are read the same way the app reads them,
// and the two halves enter at different places for the reason in DECISIONS.md
// D-09: windows constrain which chores somebody can be given, and presence
// alone changes how many points they owe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// One client for the whole module, and the type taken from the value rather
// than from `ReturnType<typeof createClient>`. Without the generic arguments
// that helper resolves its schema to `never`, and every table and RPC call
// through a parameter typed that way stops checking.
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SupabaseClient = typeof supabase;

// ---------------------------------------------------------------------------
// Vocabulary — lib/domain/scheduling/types.ts
// ---------------------------------------------------------------------------

type ChoreSlot = "morning" | "evening" | "any";
type ChoreScope = "house" | "room";
type ChoreFrequency = "daily" | "weekly" | "times_per_week";
type WindowKind = "full" | "morning" | "evening";
type Residency = "full_time" | "weekday_only" | "weekend_only";

const DAY_START_MIN = 6 * 60; // 06:00
const DAY_END_MIN = 23 * 60; // 23:00
const MIN_BUFFER_MIN = 15;

/** HC-6 — nobody gets more than this on one day, however far behind they are. */
const MAX_INSTANCES_PER_DAY = 3;
const MAX_MINUTES_PER_DAY = 150;

interface ChoreTemplate {
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

interface ChoreInstance {
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
  /** Set when the instance exists because a guest is staying (HC-7). */
  guestId?: string;
  hostMemberId?: string;
}

interface SchedulingMember {
  memberId: string;
  canCook: boolean;
  roomId: string | null;
  residency: Residency;
  joinedDate: string;
  leftDate: string | null;
}

/** Minutes since midnight, half-open [startMin, endMin). */
interface AvailabilityWindow {
  kind: WindowKind;
  startMin: number;
  endMin: number;
}

type WeekWindows = Map<string, AvailabilityWindow[]>;

interface MemberLoad {
  byDate: Map<string, ChoreInstance[]>;
}

/** The columns of chore_templates this job reads. */
interface ChoreTemplateRow {
  id: string;
  name: string;
  effort_points: number;
  duration_min: number;
  slot: ChoreSlot;
  scope: ChoreScope;
  room_id: string | null;
  frequency: ChoreFrequency;
  times_per_week: number | null;
  requires_cooking_skill: boolean;
  is_heavy: boolean;
}

interface HouseMemberRow {
  id: string;
  can_cook: boolean;
  residency: Residency;
  joined_date: string;
  left_date: string | null;
}

interface AvailabilityRow {
  member_id: string;
  day_of_week: number;
  is_home: boolean;
  leaves_at: string | null;
  returns_at: string | null;
}

interface ExceptionRow {
  member_id: string;
  exc_date: string;
  exc_type: ExceptionType;
  leaves_at: string | null;
  returns_at: string | null;
}

interface GuestRow {
  id: string;
  host_member_id: string;
  from_date: string;
  to_date: string;
  is_assignable: boolean;
}

type ExceptionType = "away" | "home_all_day" | "custom_hours";

interface DayAvailability {
  dayOfWeek: number;
  isHome: boolean;
  leavesAtMin: number | null;
  returnsAtMin: number | null;
}

interface AvailabilityException {
  date: string;
  type: ExceptionType;
  leavesAtMin: number | null;
  returnsAtMin: number | null;
}

// ---------------------------------------------------------------------------
// Dates and capacity — lib/domain/scheduling/capacity.ts
// ---------------------------------------------------------------------------

/** The calendar date in a given IANA timezone, as YYYY-MM-DD. */
function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before a date. */
function weekStartOf(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoDayOfWeek - 1));
  return date.toISOString().slice(0, 10);
}

function nextWeekStart(isoDate: string): string {
  return addDays(weekStartOf(isoDate), 7);
}

/** Every date in the week, starting from the Monday. */
function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
}

/** 0 = Sunday, in a way that does not drift by timezone. */
function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

const FULL_DAY: AvailabilityWindow = {
  kind: "full",
  startMin: DAY_START_MIN,
  endMin: DAY_END_MIN,
};

/** "09:30" or "09:30:00" -> 570. Null passes straight through. */
function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * The windows a member has on one date.
 *
 * An exception overrides the weekday pattern entirely — that is the whole point
 * of an exception. Windows shorter than the buffer are dropped rather than
 * offered: a fifteen-minute gap is not capacity, it is a coincidence.
 */
function windowsForDate(
  weekday: DayAvailability | undefined,
  exception?: AvailabilityException,
): AvailabilityWindow[] {
  if (exception?.type === "away") return [];
  if (exception?.type === "home_all_day") return [FULL_DAY];

  const leavesAtMin = exception?.leavesAtMin ?? weekday?.leavesAtMin ?? null;
  const returnsAtMin = exception?.returnsAtMin ?? weekday?.returnsAtMin ?? null;

  // BR-020 — no pattern recorded means home all day. Assuming somebody is out
  // would quietly excuse them from work, which is the failure this product
  // exists to prevent.
  if (!weekday && !exception) return [FULL_DAY];
  if (weekday && !weekday.isHome && !exception) return [];
  if (leavesAtMin === null && returnsAtMin === null) return [FULL_DAY];

  const windows: AvailabilityWindow[] = [];
  if (leavesAtMin !== null && leavesAtMin > DAY_START_MIN) {
    windows.push({ kind: "morning", startMin: DAY_START_MIN, endMin: leavesAtMin });
  }
  if (returnsAtMin !== null && returnsAtMin < DAY_END_MIN) {
    windows.push({ kind: "evening", startMin: returnsAtMin, endMin: DAY_END_MIN });
  }

  return windows.filter((window) => window.endMin - window.startMin >= MIN_BUFFER_MIN);
}

function buildWeekWindows(
  weekStart: string,
  weekdays: DayAvailability[] = [],
  exceptions: AvailabilityException[] = [],
): WeekWindows {
  const byDayOfWeek = new Map(weekdays.map((day) => [day.dayOfWeek, day]));
  const byDate = new Map(exceptions.map((exception) => [exception.date, exception]));

  const windows: WeekWindows = new Map();
  for (const date of weekDates(weekStart)) {
    windows.set(date, windowsForDate(byDayOfWeek.get(dayOfWeek(date)), byDate.get(date)));
  }
  return windows;
}

function slotMatches(kind: WindowKind, slot: ChoreSlot): boolean {
  if (kind === "full") return true;
  if (slot === "any") return true;
  return kind === slot;
}

/** HC-1 — is there a window long enough, in the right part of the day? */
function fits(
  windows: AvailabilityWindow[],
  slot: ChoreSlot,
  durationMin: number,
): boolean {
  return windows.some(
    (window) =>
      slotMatches(window.kind, slot) &&
      window.endMin - window.startMin >= durationMin + MIN_BUFFER_MIN,
  );
}

/** A tie-break (SO-5), never a target input. */
function weeklyCapacityMinutes(windows: WeekWindows): number {
  let total = 0;
  for (const dayWindows of windows.values()) {
    for (const window of dayWindows) total += window.endMin - window.startMin;
  }
  return total;
}

function residencyCoversDate(member: SchedulingMember, isoDate: string): boolean {
  if (member.joinedDate > isoDate) return false;
  if (member.leftDate !== null && member.leftDate < isoDate) return false;

  const weekend = dayOfWeek(isoDate) === 0 || dayOfWeek(isoDate) === 6;
  if (member.residency === "weekday_only") return !weekend;
  if (member.residency === "weekend_only") return weekend;
  return true;
}

/**
 * Days a member is actually around this week. Feeds the target weighting.
 *
 * A declared away day removes a day; being busy does not (D-09).
 */
function presentDays(
  member: SchedulingMember,
  weekStart: string,
  exceptions: AvailabilityException[] = [],
): number {
  const away = new Set(
    exceptions.filter((exception) => exception.type === "away").map((e) => e.date),
  );
  return weekDates(weekStart).filter(
    (date) => residencyCoversDate(member, date) && !away.has(date),
  ).length;
}

// ---------------------------------------------------------------------------
// Demand — lib/domain/scheduling/demand.ts
// ---------------------------------------------------------------------------

/**
 * Spreads n occurrences as evenly as possible across seven days, so that three
 * a week lands on Monday, Wednesday and Friday rather than three days running.
 */
function spreadAcrossWeek(count: number): number[] {
  if (count <= 0) return [];
  if (count >= 7) return [0, 1, 2, 3, 4, 5, 6].slice(0, count);

  const days: number[] = [];
  for (let index = 0; index < count; index += 1) {
    days.push(Math.round((index * 7) / count));
  }
  return days;
}

interface DemandGuest {
  guestId: string;
  hostMemberId: string;
  fromDate: string;
  toDate: string;
  isAssignable: boolean;
}

function buildDemand(input: {
  weekStart: string;
  templates: ChoreTemplate[];
  roomIds: string[];
  guests?: DemandGuest[];
  memberCount?: number;
}): ChoreInstance[] {
  const dates = weekDates(input.weekStart);
  const instances: ChoreInstance[] = [];

  const push = (
    template: ChoreTemplate,
    date: string,
    occurrence: number,
    roomId: string | null,
  ) => {
    instances.push({
      id: `${template.id}:${date}:${occurrence}${roomId ? `:${roomId}` : ""}`,
      templateId: template.id,
      name: template.name,
      choreDate: date,
      slot: template.slot,
      effortPoints: template.effortPoints,
      durationMin: template.durationMin,
      scope: template.scope,
      roomId,
      requiresCookingSkill: template.requiresCookingSkill,
      isHeavy: template.isHeavy,
    });
  };

  for (const template of input.templates) {
    const targets =
      template.scope === "room"
        ? template.roomId
          ? [template.roomId]
          : input.roomIds
        : [null];

    for (const roomId of targets) {
      switch (template.frequency) {
        case "daily":
          dates.forEach((date, index) => push(template, date, index, roomId));
          break;

        case "weekly":
          // Midweek: a weekly chore on Monday collides with everything else
          // that resets on Monday.
          push(template, dates[2], 0, roomId);
          break;

        case "times_per_week": {
          const count = Math.min(7, Math.max(1, template.timesPerWeek ?? 1));
          spreadAcrossWeek(count).forEach((dayIndex, occurrence) =>
            push(template, dates[dayIndex], occurrence, roomId),
          );
          break;
        }
      }
    }
  }

  instances.push(
    ...guestDemand({
      instances,
      dates,
      guests: input.guests ?? [],
      memberCount: input.memberCount ?? 0,
    }),
  );

  // Sorted so a run is reproducible regardless of the order the templates came
  // back from the database in.
  return instances.sort((a, b) =>
    a.choreDate === b.choreDate
      ? a.id.localeCompare(b.id)
      : a.choreDate.localeCompare(b.choreDate),
  );
}

/**
 * The extra work a guest creates — docs/06-ALGORITHMS.md section 2.3.
 *
 * An extra person in the house for a day is an extra person's worth of mess.
 * Room-scoped chores are excluded (a visitor does not create a second bedroom),
 * skilled chores are excluded (their presence makes the existing dinner bigger,
 * which the expense split already charges for), and an unassignable guest
 * produces nothing at all.
 *
 * At least one job is always taken, which rounds up. See the note on the app's
 * copy in lib/domain/scheduling/demand.ts: the smallest chore in the house is
 * the granularity available, and rounding to nearest would give a visitor no
 * work at all.
 */
function guestDemand(input: {
  instances: ChoreInstance[];
  dates: string[];
  guests: DemandGuest[];
  memberCount: number;
}): ChoreInstance[] {
  const assignable = input.guests.filter((guest) => guest.isAssignable);
  if (assignable.length === 0 || input.memberCount <= 0) return [];

  const extra: ChoreInstance[] = [];

  for (const date of input.dates) {
    const common = input.instances
      .filter(
        (instance) =>
          instance.choreDate === date &&
          instance.scope === "house" &&
          !instance.requiresCookingSkill &&
          !instance.guestId,
      )
      .sort((a, b) =>
        a.effortPoints === b.effortPoints
          ? a.id.localeCompare(b.id)
          : a.effortPoints - b.effortPoints,
      );

    if (common.length === 0) continue;

    const dayPoints = common.reduce((sum, instance) => sum + instance.effortPoints, 0);
    const share = dayPoints / input.memberCount;

    for (const guest of assignable) {
      if (guest.fromDate > date || date > guest.toDate) continue;

      let taken = 0;
      for (const instance of common) {
        if (taken >= share) break;
        extra.push({
          ...instance,
          id: `${instance.id}:guest:${guest.guestId}`,
          guestId: guest.guestId,
          hostMemberId: guest.hostMemberId,
        });
        taken += instance.effortPoints;
      }
    }
  }

  return extra;
}

function totalPoints(instances: ChoreInstance[]): number {
  return instances.reduce((sum, instance) => sum + instance.effortPoints, 0);
}

// ---------------------------------------------------------------------------
// Targets — lib/domain/fairness/targets.ts
// ---------------------------------------------------------------------------

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Availability is deliberately not an input here (DECISIONS.md D-09). Presence
 * is — an away day genuinely removes somebody from the house — but being busy
 * is not.
 */
interface MemberTarget {
  memberId: string;
  baseTarget: number;
  carryIn: number;
  effectiveTarget: number;
  presentDays: number;
}

function computeTargets(
  totalWeekPoints: number,
  members: { memberId: string; presentDays: number; carryIn: number }[],
  carryCapPercent: number,
): MemberTarget[] {
  const totalWeight = members.reduce(
    (sum, member) => sum + member.presentDays / 7,
    0,
  );

  return members.map((member) => {
    const weight = member.presentDays / 7;
    const baseTarget = totalWeight > 0 ? (totalWeekPoints * weight) / totalWeight : 0;

    // Floored, so a cap of "50 percent of 105" is 52, not 52.5. Rounding up
    // would let the adjustment exceed the percentage the house configured.
    const cap = Math.floor((baseTarget * carryCapPercent) / 100);
    const adjustment = clamp(-member.carryIn, -cap, cap);

    return {
      memberId: member.memberId,
      baseTarget: Math.round(baseTarget),
      carryIn: member.carryIn,
      effectiveTarget: Math.max(0, Math.round(baseTarget + adjustment)),
      presentDays: member.presentDays,
    };
  });
}

// ---------------------------------------------------------------------------
// Hard constraints — lib/domain/scheduling/constraints.ts
// ---------------------------------------------------------------------------

function emptyLoad(): MemberLoad {
  return { byDate: new Map() };
}

function addToLoad(load: MemberLoad, instance: ChoreInstance): void {
  const list = load.byDate.get(instance.choreDate) ?? [];
  list.push(instance);
  load.byDate.set(instance.choreDate, list);
}

function removeFromLoad(load: MemberLoad, instance: ChoreInstance): void {
  const list = load.byDate.get(instance.choreDate) ?? [];
  const index = list.findIndex((held) => held.id === instance.id);
  if (index >= 0) list.splice(index, 1);
  load.byDate.set(instance.choreDate, list);
}

/**
 * There are no soft exceptions here. A violation invalidates the assignment,
 * full stop — an unfair schedule is an argument, an infeasible one destroys
 * trust in every other row on the screen.
 */
function satisfiesHardConstraints(input: {
  instance: ChoreInstance;
  member: SchedulingMember;
  windows: WeekWindows;
  load: MemberLoad;
  roomOccupancy?: Map<string, string[]>;
}): boolean {
  const { instance, member, windows, load } = input;

  // HC-8 — an active member on that date.
  if (member.joinedDate > instance.choreDate) return false;
  if (member.leftDate !== null && member.leftDate < instance.choreDate) return false;

  // HC-4 — presence and residency.
  if (!residencyCoversDate(member, instance.choreDate)) return false;

  // HC-1 — a window long enough, in the right part of the day.
  if (!fits(windows.get(instance.choreDate) ?? [], instance.slot, instance.durationMin)) {
    return false;
  }

  // HC-2 — a room chore belongs to that room's occupants.
  if (instance.scope === "room" && instance.roomId) {
    const occupants = input.roomOccupancy?.get(instance.roomId);
    const occupies = occupants
      ? occupants.includes(member.memberId)
      : member.roomId === instance.roomId;
    if (!occupies) return false;
  }

  // HC-3 — cooking is a skill, not a rota slot. Somebody who cannot cook owes
  // the same points through other work.
  if (instance.requiresCookingSkill && !member.canCook) return false;

  const sameDay = load.byDate.get(instance.choreDate) ?? [];

  // HC-6 — the daily ceiling, however far behind somebody is.
  if (sameDay.length >= MAX_INSTANCES_PER_DAY) return false;
  const minutesThatDay = sameDay.reduce((sum, held) => sum + held.durationMin, 0);
  if (minutesThatDay + instance.durationMin > MAX_MINUTES_PER_DAY) return false;

  // HC-5 — no double-booking within a slot.
  const clash = sameDay.some(
    (held) => held.slot === instance.slot && held.slot !== "any" && instance.slot !== "any",
  );
  if (clash) return false;

  // HC-7 — a guest's work belongs to their host and to nobody else. Spreading
  // it across the house would make hosting free, which is the behaviour the
  // guest mechanism exists to price.
  if (instance.guestId && instance.hostMemberId !== member.memberId) return false;

  return true;
}

// ---------------------------------------------------------------------------
// The solver — lib/domain/scheduling/solver.ts
// ---------------------------------------------------------------------------

interface Candidate {
  member: SchedulingMember;
  remaining: number;
  clusterPenalty: number;
  varietyPenalty: number;
  capacityLeft: number;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  // Furthest below target first. This is SO-1, and it is what makes the
  // schedule converge on fairness rather than on convenience.
  if (b.remaining !== a.remaining) return b.remaining - a.remaining;
  if (a.clusterPenalty !== b.clusterPenalty) return a.clusterPenalty - b.clusterPenalty;
  if (a.varietyPenalty !== b.varietyPenalty) return a.varietyPenalty - b.varietyPenalty;
  if (b.capacityLeft !== a.capacityLeft) return b.capacityLeft - a.capacityLeft;
  return a.member.memberId.localeCompare(b.member.memberId);
}

/** Σ (assigned − target)², the objective the swaps try to reduce (SO-1). */
function objective(points: Map<string, number>, targets: Map<string, number>): number {
  let total = 0;
  for (const [memberId, target] of targets) {
    const deviation = (points.get(memberId) ?? 0) - target;
    total += deviation * deviation;
  }
  return total;
}

function maxDeviationOf(
  points: Map<string, number>,
  targets: Map<string, number>,
): number {
  let worst = 0;
  for (const [memberId, target] of targets) {
    worst = Math.max(worst, Math.abs((points.get(memberId) ?? 0) - target));
  }
  return worst;
}

function solve(input: {
  instances: ChoreInstance[];
  members: SchedulingMember[];
  windowsByMember: Map<string, WeekWindows>;
  targets: Map<string, number>;
  roomOccupancy?: Map<string, string[]>;
  maxLocalSearchPasses?: number;
}): {
  assignments: { instanceId: string; memberId: string | null }[];
  openInstanceIds: string[];
  maxDeviation: number;
} {
  const loads = new Map<string, MemberLoad>(
    input.members.map((member) => [member.memberId, emptyLoad()]),
  );
  const points = new Map<string, number>(
    input.members.map((member) => [member.memberId, 0]),
  );
  const templatesTaken = new Map<string, Map<string, number>>(
    input.members.map((member) => [member.memberId, new Map()]),
  );
  const capacity = new Map<string, number>(
    input.members.map((member) => [
      member.memberId,
      weeklyCapacityMinutes(input.windowsByMember.get(member.memberId) ?? new Map()),
    ]),
  );

  const eligibleByInstance = new Map<string, SchedulingMember[]>();
  for (const instance of input.instances) {
    eligibleByInstance.set(
      instance.id,
      input.members.filter((member) =>
        satisfiesHardConstraints({
          instance,
          member,
          windows: input.windowsByMember.get(member.memberId) ?? new Map(),
          load: emptyLoad(), // eligibility before anything is assigned
          roomOccupancy: input.roomOccupancy,
        }),
      ),
    );
  }

  // Most-constrained first: the chore only two people can do is placed before
  // the one anybody could take, or those two will already be full.
  const ordered = [...input.instances].sort((a, b) => {
    const aCount = eligibleByInstance.get(a.id)?.length ?? 0;
    const bCount = eligibleByInstance.get(b.id)?.length ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    if (b.effortPoints !== a.effortPoints) return b.effortPoints - a.effortPoints;
    return a.id.localeCompare(b.id);
  });

  const assignments = new Map<string, string | null>();
  const openInstanceIds: string[] = [];

  for (const instance of ordered) {
    const candidates: Candidate[] = [];

    for (const member of eligibleByInstance.get(instance.id) ?? []) {
      const load = loads.get(member.memberId)!;

      // Re-checked against the load as it stands now: eligibility was computed
      // on an empty schedule, and HC-5 and HC-6 depend on what is already held.
      if (
        !satisfiesHardConstraints({
          instance,
          member,
          windows: input.windowsByMember.get(member.memberId) ?? new Map(),
          load,
          roomOccupancy: input.roomOccupancy,
        })
      ) {
        continue;
      }

      const target = input.targets.get(member.memberId) ?? 0;
      const taken = templatesTaken.get(member.memberId)!;

      candidates.push({
        member,
        remaining: target - (points.get(member.memberId) ?? 0),
        clusterPenalty: (load.byDate.get(instance.choreDate) ?? []).length,
        varietyPenalty: taken.get(instance.templateId) ?? 0,
        capacityLeft: capacity.get(member.memberId) ?? 0,
      });
    }

    if (candidates.length === 0) {
      // Nobody can legally take it. It goes to the pool and the run carries on
      // (D-10) — nothing is silently dropped, and one impossible chore does not
      // cost the house its week.
      assignments.set(instance.id, null);
      openInstanceIds.push(instance.id);
      continue;
    }

    candidates.sort(compareCandidates);
    const chosen = candidates[0].member;

    assignments.set(instance.id, chosen.memberId);
    addToLoad(loads.get(chosen.memberId)!, instance);
    points.set(chosen.memberId, (points.get(chosen.memberId) ?? 0) + instance.effortPoints);
    capacity.set(
      chosen.memberId,
      (capacity.get(chosen.memberId) ?? 0) - instance.durationMin,
    );
    const taken = templatesTaken.get(chosen.memberId)!;
    taken.set(instance.templateId, (taken.get(instance.templateId) ?? 0) + 1);
  }

  localSearch({
    input,
    assignments,
    loads,
    points,
    passes: input.maxLocalSearchPasses ?? 200,
  });

  return {
    assignments: input.instances.map((instance) => ({
      instanceId: instance.id,
      memberId: assignments.get(instance.id) ?? null,
    })),
    openInstanceIds,
    maxDeviation: maxDeviationOf(points, input.targets),
  };
}

/**
 * Pairwise swaps that reduce the objective without breaking a constraint.
 *
 * Capped, because this runs on a schedule and a solver that occasionally takes
 * a minute is a solver that occasionally does not run at all.
 */
function localSearch(args: {
  input: {
    instances: ChoreInstance[];
    members: SchedulingMember[];
    windowsByMember: Map<string, WeekWindows>;
    targets: Map<string, number>;
    roomOccupancy?: Map<string, string[]>;
  };
  assignments: Map<string, string | null>;
  loads: Map<string, MemberLoad>;
  points: Map<string, number>;
  passes: number;
}): void {
  const { input, assignments, loads, points } = args;
  const memberById = new Map(input.members.map((member) => [member.memberId, member]));

  const assigned = input.instances.filter(
    (instance) => assignments.get(instance.id) !== null,
  );

  for (let pass = 0; pass < args.passes; pass += 1) {
    let improved = false;

    for (let i = 0; i < assigned.length; i += 1) {
      for (let j = i + 1; j < assigned.length; j += 1) {
        const first = assigned[i];
        const second = assigned[j];
        const firstMemberId = assignments.get(first.id);
        const secondMemberId = assignments.get(second.id);

        if (!firstMemberId || !secondMemberId || firstMemberId === secondMemberId) {
          continue;
        }

        const before = objective(points, input.targets);

        const firstMember = memberById.get(firstMemberId)!;
        const secondMember = memberById.get(secondMemberId)!;
        const firstLoad = loads.get(firstMemberId)!;
        const secondLoad = loads.get(secondMemberId)!;

        // Take both off, so each is judged against the state it would land in.
        removeFromLoad(firstLoad, first);
        removeFromLoad(secondLoad, second);

        const legal =
          satisfiesHardConstraints({
            instance: second,
            member: firstMember,
            windows: input.windowsByMember.get(firstMemberId) ?? new Map(),
            load: firstLoad,
            roomOccupancy: input.roomOccupancy,
          }) &&
          satisfiesHardConstraints({
            instance: first,
            member: secondMember,
            windows: input.windowsByMember.get(secondMemberId) ?? new Map(),
            load: secondLoad,
            roomOccupancy: input.roomOccupancy,
          });

        if (!legal) {
          addToLoad(firstLoad, first);
          addToLoad(secondLoad, second);
          continue;
        }

        const delta = second.effortPoints - first.effortPoints;
        points.set(firstMemberId, (points.get(firstMemberId) ?? 0) + delta);
        points.set(secondMemberId, (points.get(secondMemberId) ?? 0) - delta);

        if (objective(points, input.targets) < before) {
          assignments.set(first.id, secondMemberId);
          assignments.set(second.id, firstMemberId);
          addToLoad(firstLoad, second);
          addToLoad(secondLoad, first);
          improved = true;
        } else {
          points.set(firstMemberId, (points.get(firstMemberId) ?? 0) - delta);
          points.set(secondMemberId, (points.get(secondMemberId) ?? 0) + delta);
          addToLoad(firstLoad, first);
          addToLoad(secondLoad, second);
        }
      }
    }

    if (!improved) break;
  }
}

// ---------------------------------------------------------------------------
// The window a chore may be done in — lib/data/chores.ts
// ---------------------------------------------------------------------------

function instanceWindow(
  choreDate: string,
  slot: ChoreSlot,
): { windowStart: string; windowEnd: string; deadline: string } {
  const bounds: Record<string, [string, string]> = {
    morning: ["06:00", "12:00"],
    evening: ["17:00", "23:00"],
    any: ["06:00", "23:00"],
  };
  const [start, end] = bounds[slot] ?? bounds.any;

  return {
    windowStart: `${choreDate}T${start}:00Z`,
    windowEnd: `${choreDate}T${end}:00Z`,
    deadline: `${choreDate}T23:59:00Z`,
  };
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

interface HouseResult {
  house_id: string;
  week_start: string;
  run_id?: string;
  assigned?: number;
  open?: number;
  max_deviation?: number;
  skipped?: string;
  error?: string;
}

Deno.serve(async (request) => {
  // An explicit week and house can be passed in for a catch-up or a manual run.
  let requestedWeek: string | null = null;
  let requestedHouse: string | null = null;
  try {
    const body = await request.json();
    requestedWeek = typeof body?.week_start === "string" ? body.week_start : null;
    requestedHouse = typeof body?.house_id === "string" ? body.house_id : null;
  } catch {
    // No body is the normal case, from cron.
  }

  let housesQuery = supabase.from("houses").select("id, timezone");
  if (requestedHouse) housesQuery = housesQuery.eq("id", requestedHouse);

  const { data: houses, error: housesError } = await housesQuery;
  if (housesError) {
    return Response.json({ error: housesError.message }, { status: 500 });
  }

  const results: HouseResult[] = [];

  for (const house of houses ?? []) {
    const weekStart = requestedWeek ?? nextWeekStart(todayIn(house.timezone));

    try {
      results.push(await generateForHouse(supabase, house.id, weekStart));
    } catch (cause) {
      // One house's bad configuration must not stop the rest of the run.
      results.push({
        house_id: house.id,
        week_start: weekStart,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return Response.json({ generated: results });
});

async function generateForHouse(
  supabase: SupabaseClient,
  houseId: string,
  weekStart: string,
): Promise<HouseResult> {
  const [
    templatesResult,
    membersResult,
    roomsResult,
    occupancyResult,
    settingsResult,
    availabilityResult,
    exceptionsResult,
    guestsResult,
  ] = await Promise.all([
      supabase
        .from("chore_templates")
        .select("*")
        .eq("house_id", houseId)
        .eq("active", true),
      supabase
        .from("house_members")
        .select("id, can_cook, residency, joined_date, left_date")
        .eq("house_id", houseId)
        .eq("status", "active")
        // A resident the house has said gets no chores is not a candidate. An
        // infant left in the solver would be handed a share of the mopping.
        .eq("does_chores", true),
      supabase.from("rooms").select("id").eq("house_id", houseId).is("deleted_at", null),
      supabase
        .from("v_current_occupancy")
        .select("room_id, member_id")
        .eq("house_id", houseId),
      supabase
        .from("house_settings")
        .select("carry_cap_percent")
        .eq("house_id", houseId)
        .maybeSingle(),
      supabase
        .from("member_availability")
        .select("member_id, day_of_week, is_home, leaves_at, returns_at")
        .eq("house_id", houseId),
      supabase
        .from("availability_exceptions")
        .select("member_id, exc_date, exc_type, leaves_at, returns_at")
        .eq("house_id", houseId)
        .gte("exc_date", weekStart)
        .lte("exc_date", addDays(weekStart, 6)),
      supabase
        .from("guests")
        .select("id, host_member_id, from_date, to_date, is_assignable")
        .eq("house_id", houseId)
        .lte("from_date", addDays(weekStart, 6))
        .gte("to_date", weekStart),
    ]);

  for (const result of [
    templatesResult,
    membersResult,
    roomsResult,
    occupancyResult,
    availabilityResult,
    exceptionsResult,
    guestsResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  // A house with no active members or no templates is not a failure — it is a
  // house that has not finished setting up. It is reported and skipped.
  const memberRows = membersResult.data ?? [];
  if (memberRows.length === 0) {
    return { house_id: houseId, week_start: weekStart, skipped: "no active members" };
  }

  const templateRows = templatesResult.data ?? [];
  if (templateRows.length === 0) {
    return { house_id: houseId, week_start: weekStart, skipped: "no active templates" };
  }

  const roomByMember = new Map<string, string>(
    (occupancyResult.data ?? []).map((row: { member_id: string; room_id: string }) => [
      row.member_id,
      row.room_id,
    ]),
  );

  const members: SchedulingMember[] = memberRows.map(
    (row: HouseMemberRow) => ({
      memberId: row.id,
      canCook: row.can_cook,
      roomId: roomByMember.get(row.id) ?? null,
      residency: row.residency,
      joinedDate: row.joined_date,
      leftDate: row.left_date,
    }),
  );

  const templates: ChoreTemplate[] = templateRows.map((row: ChoreTemplateRow) => ({
    id: row.id,
    name: row.name,
    effortPoints: row.effort_points,
    durationMin: row.duration_min,
    slot: row.slot,
    scope: row.scope,
    roomId: row.room_id,
    frequency: row.frequency,
    timesPerWeek: row.times_per_week,
    requiresCookingSkill: row.requires_cooking_skill,
    isHeavy: row.is_heavy,
  }));

  const instances = buildDemand({
    weekStart,
    templates,
    roomIds: (roomsResult.data ?? []).map((room: { id: string }) => room.id),
    guests: (guestsResult.data ?? []).map((guest: GuestRow) => ({
      guestId: guest.id,
      hostMemberId: guest.host_member_id,
      fromDate: guest.from_date,
      toDate: guest.to_date,
      isAssignable: guest.is_assignable,
    })),
    memberCount: members.length,
  });

  // A member with no rows recorded is absent from both maps, and
  // buildWeekWindows called with empty lists yields a full day everywhere —
  // BR-020, expressed by omission rather than a special case.
  const patternByMember = new Map<string, DayAvailability[]>();
  for (const row of (availabilityResult.data ?? []) as AvailabilityRow[]) {
    const days = patternByMember.get(row.member_id) ?? [];
    days.push({
      dayOfWeek: row.day_of_week,
      isHome: row.is_home,
      leavesAtMin: timeToMinutes(row.leaves_at),
      returnsAtMin: timeToMinutes(row.returns_at),
    });
    patternByMember.set(row.member_id, days);
  }

  const exceptionsByMember = new Map<string, AvailabilityException[]>();
  for (const row of (exceptionsResult.data ?? []) as ExceptionRow[]) {
    const list = exceptionsByMember.get(row.member_id) ?? [];
    list.push({
      date: row.exc_date,
      type: row.exc_type,
      leavesAtMin: timeToMinutes(row.leaves_at),
      returnsAtMin: timeToMinutes(row.returns_at),
    });
    exceptionsByMember.set(row.member_id, list);
  }

  const windowsByMember = new Map<string, WeekWindows>(
    members.map((member) => [
      member.memberId,
      buildWeekWindows(
        weekStart,
        patternByMember.get(member.memberId) ?? [],
        exceptionsByMember.get(member.memberId) ?? [],
      ),
    ]),
  );

  // Last week's carry, which is what makes a deficit follow somebody forward.
  // close-effort-week runs half an hour earlier for exactly this reason.
  const { data: previousLedger } = await supabase
    .from("effort_ledger")
    .select("member_id, carry_out")
    .eq("house_id", houseId)
    .eq("week_start", addDays(weekStart, -7));

  const carryByMember = new Map<string, number>(
    (previousLedger ?? []).map((row: { member_id: string; carry_out: number }) => [
      row.member_id,
      row.carry_out,
    ]),
  );

  const targets = computeTargets(
    totalPoints(instances),
    members.map((member) => ({
      memberId: member.memberId,
      presentDays: presentDays(
        member,
        weekStart,
        exceptionsByMember.get(member.memberId) ?? [],
      ),
      carryIn: carryByMember.get(member.memberId) ?? 0,
    })),
    settingsResult.data?.carry_cap_percent ?? 50,
  );

  const roomOccupancy = new Map<string, string[]>();
  for (const [memberId, roomId] of roomByMember) {
    const list = roomOccupancy.get(roomId) ?? [];
    list.push(memberId);
    roomOccupancy.set(roomId, list);
  }

  const solved = solve({
    instances,
    members,
    windowsByMember,
    targets: new Map(targets.map((target) => [target.memberId, target.effectiveTarget])),
    roomOccupancy,
  });

  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));

  const payload = solved.assignments.map((assignment) => {
    const instance = instanceById.get(assignment.instanceId)!;
    const { windowStart, windowEnd, deadline } = instanceWindow(
      instance.choreDate,
      instance.slot,
    );

    return {
      template_id: instance.templateId,
      assignee_member_id: assignment.memberId ?? "",
      guest_id: instance.guestId ?? null,
      chore_date: instance.choreDate,
      slot: instance.slot,
      window_start: windowStart,
      window_end: windowEnd,
      deadline,
      effort_points: instance.effortPoints,
      duration_min: instance.durationMin,
      status: assignment.memberId ? "assigned" : "open",
    };
  });

  // The job carries no JWT, so publish_schedule's admin check can never pass.
  // It publishes through the service-role entry point instead (D-13).
  const { data: runId, error } = await supabase.rpc("publish_schedule_for_house", {
    p_house_id: houseId,
    p_week_start: weekStart,
    p_assignments: payload,
    p_generator: "engine",
    p_llm_accepted: null,
    p_llm_rationale: null,
    p_max_deviation: solved.maxDeviation,
  });

  if (error) throw new Error(error.message);

  // N-01 to everybody with work next week, and N-30 to the admins if the
  // solver could not place something. A failure to announce is logged and
  // swallowed: the week itself is published either way.
  const { error: announceError } = await supabase.rpc("notify_schedule_published", {
    p_run_id: runId,
  });
  if (announceError) {
    console.warn("published but not announced", announceError.message);
  }

  // The targets the week was solved against are written now, not at close.
  // close-effort-week reads effective_target back to compute carry_out, so a
  // week whose targets were never recorded closes with everybody at exactly
  // their earned points and a carry of zero — the deficit mechanism quietly
  // does nothing. Only the target columns are written: earned_points and the
  // counts belong to the points trigger, and a regeneration mid-week must not
  // reset them.
  const { error: ledgerError } = await supabase.from("effort_ledger").upsert(
    targets.map((target) => ({
      house_id: houseId,
      member_id: target.memberId,
      week_start: weekStart,
      base_target: target.baseTarget,
      carry_in: target.carryIn,
      effective_target: target.effectiveTarget,
      present_days: target.presentDays,
    })),
    { onConflict: "house_id,member_id,week_start" },
  );

  if (ledgerError) throw new Error(ledgerError.message);

  return {
    house_id: houseId,
    week_start: weekStart,
    run_id: runId as string,
    assigned: solved.assignments.filter((a) => a.memberId !== null).length,
    open: solved.openInstanceIds.length,
    max_deviation: solved.maxDeviation,
  };
}
