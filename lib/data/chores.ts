import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/infra/supabase/admin";
import { buildDemand, totalPoints } from "@/lib/domain/scheduling/demand";
import { buildWeekWindows, presentDays, weekDates } from "@/lib/domain/scheduling/capacity";
import { computeTargets, type MemberTarget } from "@/lib/domain/fairness/targets";
import { solve } from "@/lib/domain/scheduling/solver";
import {
  addToLoad,
  emptyLoad,
  satisfiesHardConstraints,
  type MemberLoad,
} from "@/lib/domain/scheduling/constraints";
import { MAX_INSTANCES_PER_DAY, MAX_MINUTES_PER_DAY } from "@/lib/domain/scheduling/types";
import type {
  ChoreInstance,
  ChoreTemplate,
  SchedulingMember,
  WeekWindows,
} from "@/lib/domain/scheduling/types";
import { canConfirm, type ConfirmableAssignment } from "@/lib/domain/governance/quorum";
import { proposeWithLlm } from "./schedule-llm";
import { getHouseAvailability, getHouseExceptions } from "./availability";
import { listGuests } from "./guests";
import { roomByMemberFrom } from "./house";
import type { Session } from "./house";
import type {
  AssignmentSource,
  AssignmentStatus,
  ChoreAssignmentInsert,
  ChoreAssignmentRow,
  ChoreTemplateRow,
  EffortLedgerRow,
  MemberKind,
  ScheduleRunRow,
} from "@/lib/types/database";

/**
 * The chore repository.
 *
 * Reads the facts the scheduler needs, hands them to the pure engine in
 * lib/domain/scheduling, and stores what it decides. No scheduling arithmetic
 * happens in this file.
 */

export interface AssignmentView {
  id: string;
  templateId: string;
  name: string;
  category: string;
  choreDate: string;
  slot: string;
  effortPoints: number;
  durationMin: number;
  status: AssignmentStatus;
  deadline: string;
  doneAt: string | null;
  autoConfirmed: boolean;
  rejectedReason: string | null;
  retryCount: number;
  assignee: {
    memberId: string;
    displayName: string;
    avatarUrl: string | null;
    kind: MemberKind;
    guardianMemberId: string | null;
  } | null;
  confirmedBy: { memberId: string; displayName: string } | null;
  /**
   * The quorum snapshotted onto this assignment when it was marked done, and
   * who has signed so far. `required` is 0 on a chore that auto-confirmed for
   * want of anybody to ask.
   */
  quorum: {
    required: number;
    received: number;
    leadRequired: boolean;
    confirmations: {
      memberId: string;
      displayName: string;
      isLead: boolean;
      at: string;
    }[];
  };
}

const ASSIGNMENT_SELECT = `
  *,
  chore_templates ( id, name, category ),
  assignee:house_members!chore_assignments_assignee_member_id_fkey (
    id, member_kind, guardian_member_id, users ( display_name, avatar_url )
  ),
  confirmer:house_members!chore_assignments_confirmed_by_fkey (
    id, users ( display_name )
  ),
  chore_confirmations (
    member_id, is_lead, created_at,
    house_members ( users ( display_name ) )
  )
`;

type RawAssignment = ChoreAssignmentRow & {
  chore_templates: { id: string; name: string; category: string } | null;
  assignee: {
    id: string;
    member_kind: MemberKind;
    guardian_member_id: string | null;
    users: { display_name: string; avatar_url: string | null } | null;
  } | null;
  confirmer: { id: string; users: { display_name: string } | null } | null;
  chore_confirmations: {
    member_id: string;
    is_lead: boolean;
    created_at: string;
    house_members: { users: { display_name: string } | null } | null;
  }[];
};

function toAssignmentView(row: RawAssignment): AssignmentView {
  return {
    id: row.id,
    templateId: row.template_id,
    name: row.chore_templates?.name ?? "Chore",
    category: row.chore_templates?.category ?? "other",
    choreDate: row.chore_date,
    slot: row.slot,
    effortPoints: row.effort_points,
    durationMin: row.duration_min,
    status: row.status,
    deadline: row.deadline,
    doneAt: row.done_at,
    autoConfirmed: row.auto_confirmed,
    rejectedReason: row.rejected_reason,
    retryCount: row.retry_count,
    assignee: row.assignee
      ? {
          memberId: row.assignee.id,
          displayName: row.assignee.users?.display_name ?? "Someone",
          avatarUrl: row.assignee.users?.avatar_url ?? null,
          kind: row.assignee.member_kind,
          guardianMemberId: row.assignee.guardian_member_id,
        }
      : null,
    confirmedBy: row.confirmer
      ? {
          memberId: row.confirmer.id,
          displayName: row.confirmer.users?.display_name ?? "Someone",
        }
      : null,
    quorum: {
      required: row.confirmations_required,
      received: row.confirmations_received,
      leadRequired: row.requires_lead_confirmer,
      confirmations: (row.chore_confirmations ?? []).map((entry) => ({
        memberId: entry.member_id,
        displayName: entry.house_members?.users?.display_name ?? "Someone",
        isLead: entry.is_lead,
        at: entry.created_at,
      })),
    },
  };
}

/** An `AssignmentView` as the pure eligibility rule wants to see it. */
export function confirmable(assignment: AssignmentView): ConfirmableAssignment {
  return {
    status: assignment.status,
    assigneeMemberId: assignment.assignee?.memberId ?? null,
    assigneeKind: assignment.assignee?.kind ?? "adult",
    assigneeGuardianMemberId: assignment.assignee?.guardianMemberId ?? null,
    confirmedBy: assignment.quorum.confirmations.map((entry) => entry.memberId),
  };
}

export async function listTemplates(
  session: Session,
  houseId: string,
): Promise<ChoreTemplateRow[]> {
  const { data, error } = await session.supabase
    .from("chore_templates")
    .select("*")
    .eq("house_id", houseId)
    .order("category")
    .order("name");
  if (error) throw apiErrorFromPostgres(error);
  return data ?? [];
}

/** The house week view, and the personal one — same query, different filter. */
export async function listAssignments(
  session: Session,
  houseId: string,
  range: { from: string; to: string },
  memberId?: string,
): Promise<AssignmentView[]> {
  let query = session.supabase
    .from("chore_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("house_id", houseId)
    .gte("chore_date", range.from)
    .lte("chore_date", range.to)
    .neq("status", "cancelled")
    .order("chore_date")
    .order("slot");

  if (memberId) query = query.eq("assignee_member_id", memberId);

  const { data, error } = await query;
  if (error) throw apiErrorFromPostgres(error);
  return (data as unknown as RawAssignment[]).map(toAssignmentView);
}

/**
 * Chores waiting on somebody else to confirm.
 *
 * The caller's own are excluded: they cannot confirm their own work, so it is
 * not "awaiting them". A stalled confirmation queue is the failure mode that
 * breaks the whole mechanism, which is why this has its own surface.
 */
export async function listAwaitingConfirmation(
  session: Session,
  houseId: string,
  myMemberId: string,
): Promise<AssignmentView[]> {
  const { data, error } = await session.supabase
    .from("chore_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("house_id", houseId)
    .eq("status", "done_pending")
    .neq("assignee_member_id", myMemberId)
    .order("done_at", { ascending: true });

  if (error) throw apiErrorFromPostgres(error);
  // The quorum makes "awaiting me" narrower than "awaiting somebody": a chore
  // I have already signed is waiting on other people, not on me, and my
  // dependent's chore was never mine to sign.
  return (data as unknown as RawAssignment[])
    .map(toAssignmentView)
    .filter((assignment) => canConfirm(confirmable(assignment), myMemberId));
}

export async function listOpenPool(
  session: Session,
  houseId: string,
): Promise<AssignmentView[]> {
  const { data, error } = await session.supabase
    .from("chore_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("house_id", houseId)
    .eq("status", "open")
    .order("chore_date");

  if (error) throw apiErrorFromPostgres(error);
  return (data as unknown as RawAssignment[]).map(toAssignmentView);
}

export interface StandingView {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  earnedPoints: number;
  targetPoints: number;
  carry: number;
  choresDone: number;
  choresMissed: number;
}

/** The leaderboard. Everybody sees it — that is the point of it. */
export async function getStanding(
  session: Session,
  houseId: string,
  since?: string,
): Promise<StandingView[]> {
  let ledgerQuery = session.supabase
    .from("effort_ledger")
    .select("member_id, earned_points, effective_target, carry_out, confirmed_count, missed_count")
    .eq("house_id", houseId);

  if (since) ledgerQuery = ledgerQuery.gte("week_start", since);

  const [ledgerResult, membersResult] = await Promise.all([
    ledgerQuery,
    session.supabase
      .from("house_members")
      .select("id, status, display_name, users(display_name, avatar_url)")
      .eq("house_id", houseId)
      .eq("status", "active")
      // Somebody the scheduler never gives work to has no place on a table of
      // who is carrying the house. A row of permanent zeroes reads as a
      // freeloader rather than as an infant.
      .eq("does_chores", true),
  ]);

  if (ledgerResult.error) throw apiErrorFromPostgres(ledgerResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);

  type MemberLite = {
    id: string;
    // Null for anybody with a login; set for a dependent, who has no users row.
    display_name: string | null;
    users: { display_name: string; avatar_url: string | null } | null;
  };

  const totals = new Map<string, Omit<StandingView, "displayName" | "avatarUrl">>();
  for (const row of ledgerResult.data ?? []) {
    const entry = totals.get(row.member_id) ?? {
      memberId: row.member_id,
      earnedPoints: 0,
      targetPoints: 0,
      carry: 0,
      choresDone: 0,
      choresMissed: 0,
    };
    entry.earnedPoints += row.earned_points;
    entry.targetPoints += row.effective_target;
    entry.carry += row.carry_out;
    entry.choresDone += row.confirmed_count;
    entry.choresMissed += row.missed_count;
    totals.set(row.member_id, entry);
  }

  return ((membersResult.data ?? []) as unknown as MemberLite[]).map((member) => {
    const entry = totals.get(member.id);
    return {
      memberId: member.id,
      displayName: member.users?.display_name ?? member.display_name ?? "Someone",
      avatarUrl: member.users?.avatar_url ?? null,
      earnedPoints: entry?.earnedPoints ?? 0,
      targetPoints: entry?.targetPoints ?? 0,
      carry: entry?.carry ?? 0,
      choresDone: entry?.choresDone ?? 0,
      choresMissed: entry?.choresMissed ?? 0,
    };
  });
}

export async function getScheduleRuns(
  session: Session,
  houseId: string,
): Promise<ScheduleRunRow[]> {
  const { data, error } = await session.supabase
    .from("schedule_runs")
    .select("*")
    .eq("house_id", houseId)
    .order("week_start", { ascending: false })
    .limit(12);
  if (error) throw apiErrorFromPostgres(error);
  return data ?? [];
}

export async function getLedgerWeek(
  session: Session,
  houseId: string,
  weekStart: string,
): Promise<EffortLedgerRow[]> {
  const { data, error } = await session.supabase
    .from("effort_ledger")
    .select("*")
    .eq("house_id", houseId)
    .eq("week_start", weekStart);
  if (error) throw apiErrorFromPostgres(error);
  return data ?? [];
}

/** The Monday on or before a date. Every week in the system starts on one. */
export function weekStartOf(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoDayOfWeek - 1));
  return date.toISOString().slice(0, 10);
}

export function nextWeekStart(isoDate: string): string {
  const monday = new Date(`${weekStartOf(isoDate)}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday.toISOString().slice(0, 10);
}

export interface GenerationResult {
  weekStart: string;
  runId: string | null;
  totalPoints: number;
  assignedCount: number;
  openCount: number;
  maxDeviation: number;
  targets: { memberId: string; displayName: string; effectiveTarget: number }[];
  /** `engine` unless an LLM proposal passed every check — D-36, LLM spec 5.5. */
  generator?: AssignmentSource;
  llmRationale?: string | null;
}

/**
 * Generates and publishes a week.
 *
 * Reads the facts — templates, members, rooms, availability, last week's carry
 * — hands them to the pure engine, and stores what it decides. Nothing is
 * computed here.
 *
 * The two halves of availability enter at different places, and the distinction
 * is the one the whole fairness argument rests on (D-09): the windows constrain
 * *which* chores somebody can be given, and presence alone changes *how many
 * points they owe*.
 */
export async function generateWeek(
  session: Session,
  houseId: string,
  weekStart: string,
  options: { carryCapPercent: number; dryRun?: boolean; llmSchedulingEnabled?: boolean },
): Promise<GenerationResult> {
  const [templatesResult, membersResult, roomsResult, occupancyResult] = await Promise.all([
    session.supabase
      .from("chore_templates")
      .select("*")
      .eq("house_id", houseId)
      .eq("active", true),
    session.supabase
      .from("house_members")
      .select(
        "id, can_cook, residency, joined_date, left_date, status, display_name, users(display_name)",
      )
      .eq("house_id", houseId)
      .eq("status", "active")
      .eq("does_chores", true),
    session.supabase
      .from("rooms")
      .select("id")
      .eq("house_id", houseId)
      .is("deleted_at", null),
    session.supabase
      .from("v_current_occupancy")
      .select("room_id, member_id")
      .eq("house_id", houseId),
  ]);

  if (templatesResult.error) throw apiErrorFromPostgres(templatesResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);
  if (roomsResult.error) throw apiErrorFromPostgres(roomsResult.error);
  if (occupancyResult.error) throw apiErrorFromPostgres(occupancyResult.error);

  type MemberRow = {
    id: string;
    can_cook: boolean;
    residency: SchedulingMember["residency"];
    joined_date: string;
    left_date: string | null;
    display_name: string | null;
    users: { display_name: string } | null;
  };

  const memberRows = (membersResult.data ?? []) as unknown as MemberRow[];
  if (memberRows.length === 0) throw new ApiError("NO_ACTIVE_MEMBERS");

  const roomByMember = roomByMemberFrom(occupancyResult.data);

  const members: SchedulingMember[] = memberRows.map((row) => ({
    memberId: row.id,
    canCook: row.can_cook,
    roomId: roomByMember.get(row.id) ?? null,
    residency: row.residency,
    joinedDate: row.joined_date,
    leftDate: row.left_date,
  }));

  const templates: ChoreTemplate[] = (templatesResult.data ?? []).map((row) => ({
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

  if (templates.length === 0) throw new ApiError("NO_TEMPLATES");

  // Guests staying any part of the week. An extra person is an extra person's
  // worth of mess, and the work it creates belongs to whoever invited them.
  const weekEndForGuests = weekDates(weekStart)[6];
  const guests = await listGuests(session, houseId, {
    from: weekStart,
    to: weekEndForGuests,
  });

  const instances = buildDemand({
    weekStart,
    templates,
    roomIds: (roomsResult.data ?? []).map((room) => room.id),
    guests: guests.map((guest) => ({
      guestId: guest.id,
      hostMemberId: guest.hostMemberId,
      fromDate: guest.fromDate,
      toDate: guest.toDate,
      isAssignable: guest.isAssignable,
    })),
    memberCount: members.length,
  });

  // The real windows. A member with no pattern recorded is absent from both
  // maps, and buildWeekWindows called with an empty list yields a full day
  // everywhere — BR-020, expressed by omission rather than a special case.
  const [patternByMember, exceptionsByMember] = await Promise.all([
    getHouseAvailability(session, houseId),
    getHouseExceptions(session, houseId, {
      from: weekStart,
      to: weekEndForGuests,
    }),
  ]);

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
  const previousWeek = new Date(`${weekStart}T12:00:00Z`);
  previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
  const previousLedger = await getLedgerWeek(
    session,
    houseId,
    previousWeek.toISOString().slice(0, 10),
  );
  const carryByMember = new Map(
    previousLedger.map((row) => [row.member_id, row.carry_out]),
  );

  // Presence, and only presence, reduces a target (D-09). A weekday-only member
  // is not in the house at the weekend and a declared away day removes a day
  // outright, so both count here. Being busy does not: somebody out twelve
  // hours a day owes exactly what everybody else owes, and meets it with
  // weekend-weighted work.
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
    options.carryCapPercent,
  );

  const roomOccupancy = new Map<string, string[]>();
  for (const [memberId, roomId] of roomByMember) {
    const list = roomOccupancy.get(roomId) ?? [];
    list.push(memberId);
    roomOccupancy.set(roomId, list);
  }

  const result = solve({
    instances,
    members,
    windowsByMember,
    targets: new Map(targets.map((target) => [target.memberId, target.effectiveTarget])),
    roomOccupancy,
  });

  const nameById = new Map(
    memberRows.map((row) => [
      row.id,
      row.users?.display_name ?? row.display_name ?? "Someone",
    ]),
  );

  const summary: GenerationResult = {
    weekStart,
    runId: null,
    totalPoints: totalPoints(instances),
    assignedCount: result.assignments.filter((a) => a.memberId !== null).length,
    openCount: result.openInstanceIds.length,
    maxDeviation: result.maxDeviation,
    targets: targets.map((target) => ({
      memberId: target.memberId,
      displayName: nameById.get(target.memberId) ?? "Someone",
      effectiveTarget: target.effectiveTarget,
    })),
  };

  if (options.dryRun) return summary;

  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));

  // Call site 1 — the LLM overlay (docs/10-LLM-SPEC.md section 5). It runs only
  // after the engine has produced a valid schedule, and only when the house has
  // left `llm_scheduling_enabled` on. A proposal that fails any check is
  // discarded whole and the engine's schedule is published unchanged: no repair
  // pass, and nothing user-facing to say about it.
  let assignments = result.assignments;
  let generator: AssignmentSource = "engine";
  let llmAccepted: boolean | null = null;
  let llmRationale: string | null = null;
  let publishedDeviation = result.maxDeviation;

  if (options.llmSchedulingEnabled) {
    const awayDatesByMember = new Map<string, string[]>(
      members.map((member) => [
        member.memberId,
        (exceptionsByMember.get(member.memberId) ?? [])
          .filter((exception) => exception.type === "away")
          .map((exception) => exception.date),
      ]),
    );

    const overlay = await proposeWithLlm(session, houseId, {
      weekStart,
      instances,
      members,
      windowsByMember,
      targets: new Map(targets.map((target) => [target.memberId, target.effectiveTarget])),
      roomOccupancy,
      baselineMaxDeviation: result.maxDeviation,
      names: nameById,
      awayDatesByMember,
      guests: guests.map((guest) => ({
        guestId: guest.id,
        name: guest.name,
        hostMemberId: guest.hostMemberId,
        dates: datesBetween(guest.fromDate, guest.toDate),
      })),
    });

    if (overlay) {
      llmAccepted = overlay.accepted;
      if (overlay.accepted && overlay.assignments) {
        assignments = overlay.assignments.map((assignment) => ({
          instanceId: assignment.instanceId,
          memberId: assignment.memberId,
        }));
        generator = "llm";
        llmRationale = overlay.rationale;
        publishedDeviation = overlay.maxDeviation ?? result.maxDeviation;
      }
    }
  }

  const payload = assignments.map((assignment) => {
    const instance = instanceById.get(assignment.instanceId)!;
    const { windowStart, windowEnd, deadline } = instanceWindow(instance.choreDate, instance.slot);

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

  const { data: runId, error } = await session.supabase.rpc("publish_schedule", {
    p_week_start: weekStart,
    p_assignments: payload,
    p_generator: generator,
    p_llm_accepted: llmAccepted ?? undefined,
    p_llm_rationale: llmRationale ?? undefined,
    p_max_deviation: publishedDeviation,
  });

  if (error) throw apiErrorFromPostgres(error);

  await recordWeekTargets(session, houseId, weekStart, targets);
  await announceSchedule(runId as unknown as string);

  return {
    ...summary,
    runId: runId as unknown as string,
    maxDeviation: publishedDeviation,
    assignedCount: payload.filter((row) => row.assignee_member_id !== "").length,
    generator,
    llmRationale,
  };
}

/** Every date in a stay, inclusive. The guest payload of LLM spec section 5.2. */
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * N-01 and N-30 — tells the house its week exists.
 *
 * Through the admin client, not the caller's session: `notify_schedule_published`
 * is revoked from `authenticated` because it writes to other people's feeds, and
 * a function that can write to another member's feed must not be reachable from
 * a browser (the lesson of D-20).
 *
 * A failure here is swallowed. The week is published and the assignments are
 * real whether or not the announcement went out; throwing would turn a missing
 * notification into a failed generation, which is much the worse outcome.
 */
async function announceSchedule(runId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.rpc("notify_schedule_published", { p_run_id: runId });
  } catch (error) {
    console.warn("[chores] schedule published but not announced", error);
  }
}

/**
 * Writes the targets the week was solved against into the effort ledger.
 *
 * This is not bookkeeping. `close-effort-week` reads `effective_target` back to
 * compute `carry_out`, and falls back to the member's earned points when there
 * is no row — so a week whose targets were never recorded closes with everybody
 * exactly on target and a carry of zero. The deficit would never follow anybody
 * forward and the penalty would always be nil.
 *
 * Only the target columns are written. `earned_points` and the counts belong to
 * the points trigger, which is the single door into them, and regenerating a
 * week partway through must not reset what people have already done.
 *
 * The scheduled job writes the same four columns from Deno, for the reason in
 * DECISIONS.md D-06.
 */
async function recordWeekTargets(
  session: Session,
  houseId: string,
  weekStart: string,
  targets: MemberTarget[],
): Promise<void> {
  const { error } = await session.supabase.from("effort_ledger").upsert(
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

  if (error) throw apiErrorFromPostgres(error);
}

export interface RedistributionResult {
  /** Assignments that found another taker. */
  reassigned: { assignmentId: string; toMemberId: string }[];
  /** Assignments nobody else could legally take, now in the open pool. */
  opened: string[];
}

/**
 * Moves one member's outstanding chores off a single published day.
 *
 * Called when somebody declares themselves away on a day the schedule already
 * covers. Without this, an away declaration is a formality: the chores stay on
 * the absent person, go unmarked, and become misses at 23:55 — which turns
 * telling the house the truth into a penalty, and teaches everybody not to.
 *
 * Only `assigned` rows move. Anything done, pending confirmation, confirmed or
 * already missed is history and stays where it is.
 *
 * The replacement is chosen the way the solver chooses: whoever is furthest
 * below their target this week and can legally take it. Where nobody can, the
 * chore goes to the open pool rather than to somebody who cannot do it (D-10).
 */
export async function redistributePublishedDay(
  session: Session,
  houseId: string,
  awayMemberId: string,
  date: string,
): Promise<RedistributionResult> {
  const result: RedistributionResult = { reassigned: [], opened: [] };
  const weekStart = weekStartOf(date);

  const [dayResult, membersResult, occupancyResult] = await Promise.all([
    session.supabase
      .from("chore_assignments")
      .select("*, chore_templates ( scope, room_id, requires_cooking_skill, is_heavy )")
      .eq("house_id", houseId)
      .eq("chore_date", date)
      .in("status", ["assigned", "open"]),
    session.supabase
      .from("house_members")
      .select("id, can_cook, residency, joined_date, left_date")
      .eq("house_id", houseId)
      .eq("status", "active")
      .eq("does_chores", true),
    session.supabase
      .from("v_current_occupancy")
      .select("room_id, member_id")
      .eq("house_id", houseId),
  ]);

  if (dayResult.error) throw apiErrorFromPostgres(dayResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);
  if (occupancyResult.error) throw apiErrorFromPostgres(occupancyResult.error);

  type DayRow = ChoreAssignmentRow & {
    chore_templates: {
      scope: ChoreInstance["scope"];
      room_id: string | null;
      requires_cooking_skill: boolean;
      is_heavy: boolean;
    } | null;
  };

  const dayRows = (dayResult.data ?? []) as unknown as DayRow[];
  // A guest's work does not move. HC-7 makes the host the only person who may
  // do it, so the only places it could go are back to the absent host or into
  // an open pool nobody is allowed to claim from. Somebody who is away and had
  // registered a guest should cancel the guest, which removes the work with it.
  const moving = dayRows.filter(
    (row) =>
      row.status === "assigned" &&
      row.assignee_member_id === awayMemberId &&
      row.guest_id === null,
  );
  if (moving.length === 0) return result;

  const roomByMember = roomByMemberFrom(occupancyResult.data);

  const members: SchedulingMember[] = (membersResult.data ?? [])
    .map((row) => ({
      memberId: row.id,
      canCook: row.can_cook,
      roomId: roomByMember.get(row.id) ?? null,
      residency: row.residency as SchedulingMember["residency"],
      joinedDate: row.joined_date,
      leftDate: row.left_date,
    }))
    // The person who just declared themselves away is not a candidate for the
    // work they are being taken off.
    .filter((member) => member.memberId !== awayMemberId);

  const toInstance = (row: DayRow): ChoreInstance => ({
    id: row.id,
    templateId: row.template_id,
    name: "",
    choreDate: row.chore_date,
    slot: row.slot as ChoreInstance["slot"],
    effortPoints: row.effort_points,
    durationMin: row.duration_min,
    scope: row.chore_templates?.scope ?? "house",
    roomId: row.chore_templates?.room_id ?? null,
    requiresCookingSkill: row.chore_templates?.requires_cooking_skill ?? false,
    isHeavy: row.chore_templates?.is_heavy ?? false,
    guestId: row.guest_id ?? undefined,
    hostMemberId: row.guest_id ? (row.assignee_member_id ?? undefined) : undefined,
  });

  if (members.length === 0) return openAll(session, houseId, moving, result);

  const [patternByMember, exceptionsByMember] = await Promise.all([
    getHouseAvailability(session, houseId),
    getHouseExceptions(session, houseId, { from: date, to: date }),
  ]);

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

  // What everybody else already holds that day, so HC-5 and HC-6 are judged
  // against the real schedule rather than an empty one.
  const loads = new Map<string, MemberLoad>(
    members.map((member) => [member.memberId, emptyLoad()]),
  );
  for (const row of dayRows) {
    if (!row.assignee_member_id) continue;
    const load = loads.get(row.assignee_member_id);
    if (load) addToLoad(load, toInstance(row));
  }

  // How far each candidate is below target this week, which is what decides
  // who is offered the work first.
  const ledger = await getLedgerWeek(session, houseId, weekStart);
  const remaining = new Map<string, number>(
    ledger.map((row) => [row.member_id, row.effective_target - row.earned_points]),
  );

  const roomOccupancy = new Map<string, string[]>();
  for (const [memberId, roomId] of roomByMember) {
    const list = roomOccupancy.get(roomId) ?? [];
    list.push(memberId);
    roomOccupancy.set(roomId, list);
  }

  for (const row of moving) {
    const instance = toInstance(row);

    const candidates = members
      .filter((member) =>
        satisfiesHardConstraints({
          instance,
          member,
          windows: windowsByMember.get(member.memberId) ?? new Map(),
          load: loads.get(member.memberId) ?? emptyLoad(),
          roomOccupancy,
        }),
      )
      .sort((a, b) => {
        const aRemaining = remaining.get(a.memberId) ?? 0;
        const bRemaining = remaining.get(b.memberId) ?? 0;
        if (aRemaining !== bRemaining) return bRemaining - aRemaining;
        return a.memberId.localeCompare(b.memberId);
      });

    const taker = candidates[0];

    const { error } = await session.supabase
      .from("chore_assignments")
      .update(
        taker
          ? { assignee_member_id: taker.memberId, source: "engine" }
          : { assignee_member_id: null, status: "open", source: "engine" },
      )
      .eq("id", row.id)
      .eq("status", "assigned");

    if (error) throw apiErrorFromPostgres(error);

    if (taker) {
      addToLoad(loads.get(taker.memberId)!, instance);
      remaining.set(
        taker.memberId,
        (remaining.get(taker.memberId) ?? 0) - instance.effortPoints,
      );
      result.reassigned.push({ assignmentId: row.id, toMemberId: taker.memberId });
    } else {
      result.opened.push(row.id);
    }
  }

  return result;
}

export interface GuestChoreResult {
  /** Dates that gained work, and how many points landed on the host. */
  added: { date: string; points: number; count: number }[];
  /** Dates skipped because the host already had a full day (HC-6). */
  skipped: string[];
}

/**
 * Adds a guest's share of the work to a week that is already published (E-17).
 *
 * Registering a visitor after Sunday's generation must not be a way to bring
 * somebody into the house for free. Days that have already happened are left
 * alone — the work either got done or did not, and rewriting it now would be
 * inventing history — so only the remaining nights of the stay produce chores.
 *
 * There is no solving to do. HC-7 makes the host the only eligible assignee, so
 * the only question is whether the host has room in their day, and where they
 * do not the date is reported as skipped rather than silently dropped.
 */
export async function addGuestChores(
  session: Session,
  houseId: string,
  guest: { id: string; hostMemberId: string; fromDate: string; toDate: string },
  today: string,
): Promise<GuestChoreResult> {
  const result: GuestChoreResult = { added: [], skipped: [] };

  const from = guest.fromDate > today ? guest.fromDate : today;
  if (from > guest.toDate) return result;

  const [dayResult, membersResult] = await Promise.all([
    session.supabase
      .from("chore_assignments")
      .select("*, chore_templates ( scope, room_id, requires_cooking_skill, is_heavy )")
      .eq("house_id", houseId)
      .gte("chore_date", from)
      .lte("chore_date", guest.toDate)
      .not("status", "in", "(cancelled)"),
    session.supabase
      .from("house_members")
      .select("id")
      .eq("house_id", houseId)
      .eq("status", "active")
      // The divisor for a guest's share of the day's work. Only the people who
      // actually do chores belong in it.
      .eq("does_chores", true),
  ]);

  if (dayResult.error) throw apiErrorFromPostgres(dayResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);

  const memberCount = (membersResult.data ?? []).length;
  if (memberCount === 0) return result;

  type DayRow = ChoreAssignmentRow & {
    chore_templates: {
      scope: ChoreInstance["scope"];
      room_id: string | null;
      requires_cooking_skill: boolean;
      is_heavy: boolean;
    } | null;
  };

  const rows = (dayResult.data ?? []) as unknown as DayRow[];

  const byDate = new Map<string, DayRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.chore_date) ?? [];
    list.push(row);
    byDate.set(row.chore_date, list);
  }

  for (const [date, dayRows] of [...byDate.entries()].sort()) {
    // What a visitor plausibly adds to: shared space, no skill gate, and not
    // already somebody else's guest work.
    const common = dayRows
      .filter(
        (row) =>
          row.guest_id === null &&
          (row.chore_templates?.scope ?? "house") === "house" &&
          !row.chore_templates?.requires_cooking_skill,
      )
      .sort((a, b) =>
        a.effort_points === b.effort_points
          ? a.id.localeCompare(b.id)
          : a.effort_points - b.effort_points,
      );

    if (common.length === 0) continue;

    const dayPoints = common.reduce((sum, row) => sum + row.effort_points, 0);
    const share = dayPoints / memberCount;

    // What the host already holds that day, so the ceiling is judged against
    // the real schedule.
    const hostRows = dayRows.filter(
      (row) => row.assignee_member_id === guest.hostMemberId,
    );
    let heldCount = hostRows.length;
    let heldMinutes = hostRows.reduce((sum, row) => sum + row.duration_min, 0);

    const inserts: ChoreAssignmentInsert[] = [];
    let taken = 0;

    for (const row of common) {
      if (taken >= share) break;
      if (heldCount + 1 > MAX_INSTANCES_PER_DAY) break;
      if (heldMinutes + row.duration_min > MAX_MINUTES_PER_DAY) break;

      const { windowStart, windowEnd, deadline } = instanceWindow(date, row.slot);
      inserts.push({
        house_id: houseId,
        schedule_run_id: row.schedule_run_id,
        template_id: row.template_id,
        assignee_member_id: guest.hostMemberId,
        guest_id: guest.id,
        chore_date: date,
        slot: row.slot,
        window_start: windowStart,
        window_end: windowEnd,
        deadline,
        effort_points: row.effort_points,
        duration_min: row.duration_min,
        status: "assigned",
        source: "engine",
      });

      taken += row.effort_points;
      heldCount += 1;
      heldMinutes += row.duration_min;
    }

    if (inserts.length === 0) {
      result.skipped.push(date);
      continue;
    }

    const { error } = await session.supabase.from("chore_assignments").insert(inserts);
    if (error) throw apiErrorFromPostgres(error);

    result.added.push({ date, points: taken, count: inserts.length });
  }

  return result;
}

/** Nobody left to take anything: everything outstanding goes to the pool. */
async function openAll(
  session: Session,
  houseId: string,
  rows: { id: string }[],
  result: RedistributionResult,
): Promise<RedistributionResult> {
  for (const row of rows) {
    const { error } = await session.supabase
      .from("chore_assignments")
      .update({ assignee_member_id: null, status: "open", source: "engine" })
      .eq("id", row.id)
      .eq("house_id", houseId)
      .eq("status", "assigned");
    if (error) throw apiErrorFromPostgres(error);
    result.opened.push(row.id);
  }
  return result;
}

/**
 * The window a chore may be done in, and the deadline after which it is missed.
 *
 * Times are built in UTC from the house date. Once availability is real in
 * phase 5, the window narrows to the member's own hours rather than the slot's.
 */
function instanceWindow(
  choreDate: string,
  slot: string,
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
    // The deadline runs to the end of the following day, so an evening chore
    // finished late still counts.
    deadline: `${choreDate}T23:59:00Z`,
  };
}

export { weekDates };
