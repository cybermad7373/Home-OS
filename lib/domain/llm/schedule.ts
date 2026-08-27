import {
  addToLoad,
  checkHardConstraints,
  emptyLoad,
  type MemberLoad,
} from "@/lib/domain/scheduling/constraints";
import type {
  ChoreInstance,
  SchedulingMember,
  WeekWindows,
} from "@/lib/domain/scheduling/types";
import { minutesToTime } from "@/lib/domain/scheduling/capacity";
import type { JsonSchema } from "@/lib/infra/llm/types";

/**
 * Call site 1 — the schedule proposal. docs/10-LLM-SPEC.md section 5.
 *
 * The deterministic solver optimises a numeric objective. It cannot reason
 * about "Suresh has had the bathroom three weeks running and it is starting to
 * look punitive". The model can, and it is never trusted to produce a *valid*
 * schedule — that is the validator's job, and the validator runs the same
 * constraint checker the solver does, so there is no second implementation to
 * drift.
 *
 * No repair pass, ever. A near-miss proposal is discarded whole: one schedule
 * that quietly violates somebody's availability costs more trust than every
 * schedule the model improves.
 */

export const SCHEDULE_SYSTEM_PROMPT = `You are a fair-rostering assistant for a shared house. You assign household
chores to housemates for one week.

You will receive:
- members, each with a points target, their free time windows per day, and
  whether they can cook
- chore instances, each with a date, a time slot, a duration and a point value
- the last four weeks of who did what

Your task: assign every instance to exactly one eligible person.

HARD RULES. A schedule that breaks any of these is worthless and will be
discarded in full:
1. Assign a chore only to someone whose free window on that date matches the
   chore's slot and is at least the chore's duration plus 15 minutes.
2. A room-scoped chore goes only to an occupant of that room.
3. A chore requiring cooking goes only to someone who can cook.
4. Never assign to someone marked away on that date.
5. A person's chores on one day must not overlap in time.
6. At most 3 chores, and at most 150 minutes, per person per day.
7. A guest chore goes to that guest or their host, nobody else.
8. Every instance is assigned exactly once. Never drop one, never duplicate one.

GOALS, in order of importance:
1. Each person's total points should land close to their target.
2. Avoid giving anyone the same heavy chore two weeks running.
3. Spread each person's chores across the week rather than clustering them.
4. Vary who does what.

Return only JSON matching the schema. No prose outside the JSON.`;

export const SCHEDULE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["assignments", "rationale"],
  additionalProperties: false,
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        required: ["instance_id", "assignee_id"],
        additionalProperties: false,
        properties: {
          instance_id: { type: "string" },
          assignee_id: { type: "string" },
        },
      },
    },
    rationale: { type: "string", maxLength: 600 },
  },
};

export const SCHEDULE_TEMPERATURE = 0.3;
export const SCHEDULE_MAX_TOKENS = 4000;

/** The deviation ceiling: 15 per cent worse than the engine and it is refused. */
export const BASELINE_TOLERANCE = 1.15;

export interface ScheduleProposal {
  assignments: { instance_id: string; assignee_id: string }[];
  rationale: string;
}

export interface HistoryEntry {
  memberId: string;
  chore: string;
  weeksAgo: number;
}

export interface ProposalContext {
  weekStart: string;
  instances: ChoreInstance[];
  members: SchedulingMember[];
  windowsByMember: Map<string, WeekWindows>;
  /** memberId -> points owed this week. */
  targets: Map<string, number>;
  roomOccupancy?: Map<string, string[]>;
  /** The engine's worst per-member deviation. The standard the model must match. */
  baselineMaxDeviation: number;
}

export interface PayloadInput extends ProposalContext {
  names: Map<string, string>;
  canCookByMember: Map<string, boolean>;
  roomByMember: Map<string, string | null>;
  awayDatesByMember: Map<string, string[]>;
  history: HistoryEntry[];
  /** guestId -> { name, hostMemberId, dates } */
  guests: { guestId: string; name: string; hostMemberId: string; dates: string[] }[];
}

export interface OpaqueMaps {
  memberToOpaque: Map<string, string>;
  opaqueToMember: Map<string, string>;
  instanceToOpaque: Map<string, string>;
  opaqueToInstance: Map<string, string>;
  roomToOpaque: Map<string, string>;
}

/**
 * The payload, built once, with the opaque-id maps it was built against.
 *
 * Nothing that reaches a provider carries a UUID, a surname, an email or a room
 * name — section 4. The maps come back with it so a proposal naming `m3` can be
 * resolved locally rather than by trusting the model to echo an id we know.
 */
export function buildSchedulePayload(input: PayloadInput): {
  payload: Record<string, unknown>;
  maps: OpaqueMaps;
} {
  const memberToOpaque = new Map<string, string>();
  const opaqueToMember = new Map<string, string>();
  const instanceToOpaque = new Map<string, string>();
  const opaqueToInstance = new Map<string, string>();
  const roomToOpaque = new Map<string, string>();

  input.members.forEach((member, index) => {
    const opaque = `m${index + 1}`;
    memberToOpaque.set(member.memberId, opaque);
    opaqueToMember.set(opaque, member.memberId);
    if (member.roomId && !roomToOpaque.has(member.roomId)) {
      roomToOpaque.set(member.roomId, `R${roomToOpaque.size + 1}`);
    }
  });

  for (const instance of input.instances) {
    if (instance.roomId && !roomToOpaque.has(instance.roomId)) {
      roomToOpaque.set(instance.roomId, `R${roomToOpaque.size + 1}`);
    }
  }

  input.instances.forEach((instance, index) => {
    const opaque = `i${index + 1}`;
    instanceToOpaque.set(instance.id, opaque);
    opaqueToInstance.set(opaque, instance.id);
  });

  const guestToOpaque = new Map<string, string>();
  input.guests.forEach((guest, index) => guestToOpaque.set(guest.guestId, `g${index + 1}`));

  const members = input.members.map((member) => {
    const windows: Record<string, { kind: string; start: string; end: string }[]> = {};
    const memberWindows: WeekWindows = input.windowsByMember.get(member.memberId) ?? new Map();
    for (const [date, dayWindows] of memberWindows) {
      windows[date] = dayWindows.map((window) => ({
        kind: window.kind,
        start: minutesToTime(window.startMin),
        end: minutesToTime(window.endMin),
      }));
    }

    return {
      id: memberToOpaque.get(member.memberId),
      name: firstNameOf(input.names.get(member.memberId) ?? "Someone"),
      target_points: input.targets.get(member.memberId) ?? 0,
      can_cook: input.canCookByMember.get(member.memberId) ?? member.canCook,
      room: member.roomId ? (roomToOpaque.get(member.roomId) ?? null) : null,
      windows,
      away_dates: input.awayDatesByMember.get(member.memberId) ?? [],
    };
  });

  const instances = input.instances.map((instance) => ({
    id: instanceToOpaque.get(instance.id),
    chore: instance.name,
    date: instance.choreDate,
    slot: instance.slot,
    duration_min: instance.durationMin,
    points: instance.effortPoints,
    requires_cooking: instance.requiresCookingSkill,
    scope: instance.scope,
    room: instance.roomId ? (roomToOpaque.get(instance.roomId) ?? null) : null,
    is_heavy: instance.isHeavy,
    guest: instance.guestId ? (guestToOpaque.get(instance.guestId) ?? null) : null,
  }));

  const payload = {
    week_start: input.weekStart,
    members,
    guests: input.guests.map((guest) => ({
      id: guestToOpaque.get(guest.guestId),
      name: firstNameOf(guest.name),
      host: memberToOpaque.get(guest.hostMemberId) ?? null,
      dates: guest.dates,
    })),
    instances,
    history: input.history.map((entry) => ({
      member: memberToOpaque.get(entry.memberId) ?? null,
      chore: entry.chore,
      weeks_ago: entry.weeksAgo,
    })),
    baseline_max_deviation: input.baselineMaxDeviation,
  };

  return {
    payload,
    maps: {
      memberToOpaque,
      opaqueToMember,
      instanceToOpaque,
      opaqueToInstance,
      roomToOpaque,
    },
  };
}

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0].slice(0, 20);
}

export interface TranslatedAssignment {
  instanceId: string;
  memberId: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  assignments: TranslatedAssignment[];
  maxDeviation: number;
}

/**
 * Section 5.4 — completeness, identity, the eight hard constraints, and a
 * quality floor, in that order. Every error is collected rather than the first,
 * because `llm_runs.validation_errors` is what section 9's admin view reports
 * and "it didn't work" is not a report.
 */
export function validateProposal(
  proposal: ScheduleProposal,
  maps: OpaqueMaps,
  ctx: ProposalContext,
): ValidationResult {
  const errors: string[] = [];
  const instanceById = new Map(ctx.instances.map((instance) => [instance.id, instance]));
  const memberById = new Map(ctx.members.map((member) => [member.memberId, member]));

  const translated: TranslatedAssignment[] = [];
  const seen = new Set<string>();

  for (const raw of proposal.assignments) {
    const instanceId = maps.opaqueToInstance.get(raw.instance_id);
    const memberId = maps.opaqueToMember.get(raw.assignee_id);

    if (!instanceId) {
      errors.push(`UNKNOWN_INSTANCE:${raw.instance_id}`);
      continue;
    }
    if (!memberId) {
      errors.push(`UNKNOWN_PERSON:${raw.assignee_id}`);
      continue;
    }
    if (seen.has(instanceId)) {
      errors.push(`DUPLICATE_INSTANCE:${raw.instance_id}`);
      continue;
    }

    seen.add(instanceId);
    translated.push({ instanceId, memberId });
  }

  for (const instance of ctx.instances) {
    if (!seen.has(instance.id)) {
      errors.push(`MISSING_INSTANCE:${maps.instanceToOpaque.get(instance.id) ?? instance.id}`);
    }
  }

  // The hard constraints, checked with the same function the solver uses.
  // Loads are accumulated as the proposal is walked, so HC-5 and HC-6 see what
  // the model has already given each person that day.
  const loads = new Map<string, MemberLoad>(
    ctx.members.map((member) => [member.memberId, emptyLoad()]),
  );

  const pointsByMember = new Map<string, number>(
    ctx.members.map((member) => [member.memberId, 0]),
  );

  for (const assignment of translated) {
    const instance = instanceById.get(assignment.instanceId)!;
    const member = memberById.get(assignment.memberId)!;
    const load = loads.get(assignment.memberId) ?? emptyLoad();

    const violations = checkHardConstraints({
      instance,
      member,
      windows: ctx.windowsByMember.get(assignment.memberId) ?? new Map(),
      load,
      roomOccupancy: ctx.roomOccupancy,
    });

    for (const violation of violations) {
      errors.push(`${violation.code}:${maps.instanceToOpaque.get(instance.id) ?? instance.id}`);
    }

    addToLoad(load, instance);
    loads.set(assignment.memberId, load);
    pointsByMember.set(
      assignment.memberId,
      (pointsByMember.get(assignment.memberId) ?? 0) + instance.effortPoints,
    );
  }

  const maxDeviation = maxDeviationFromTarget(pointsByMember, ctx.targets);
  if (maxDeviation > ctx.baselineMaxDeviation * BASELINE_TOLERANCE) {
    errors.push(`WORSE_THAN_BASELINE:${maxDeviation}>${ctx.baselineMaxDeviation}`);
  }

  return { valid: errors.length === 0, errors, assignments: translated, maxDeviation };
}

export function maxDeviationFromTarget(
  pointsByMember: Map<string, number>,
  targets: Map<string, number>,
): number {
  let worst = 0;
  for (const [memberId, target] of targets) {
    const earned = pointsByMember.get(memberId) ?? 0;
    worst = Math.max(worst, Math.abs(earned - target));
  }
  return worst;
}
