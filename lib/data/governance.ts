import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/infra/supabase/admin";
import { deadlineHoursFor } from "@/lib/domain/governance/matrix";
import {
  affirmativeFor,
  candidateFrom,
  checkResponse,
  progressFor,
  planBatch,
  type DecisionRecord,
} from "@/lib/domain/governance/record";
import { selectParticipants } from "@/lib/domain/governance/participants";
import {
  askFrom,
  reasonRequired,
  reserveDrawRefusal,
  type ProposalAsk,
} from "@/lib/domain/governance/preview";
import { awaitsResponse } from "@/lib/domain/governance/queue";
import { fillOpenedDays } from "./chores";
import { closeSettlementInput } from "./settlement";
import type {
  DecisionLevel,
  DecisionResponse,
  DecisionStatus,
  DecisionType,
  GovernanceMember,
  GovernancePolicy,
  Participant,
  ResponseCapacity,
  ResponseKind,
} from "@/lib/domain/governance/types";
import type { Session } from "./house";
import type {
  DecisionParticipantRow,
  DecisionResponseRow,
  DecisionRow,
  GovernancePolicyRow,
  Json,
} from "@/lib/types/database";
import type {
  PreviewDecisionInput,
  ProposeDecisionInput,
  RespondInput,
} from "@/lib/validation/governance";

/**
 * The governance repository — docs/14-GOVERNANCE-SPEC.md.
 *
 * The division of labour this module exists to hold:
 *
 *   * **who is asked** is decided by `lib/domain/governance`, over plain
 *     values, where it is property-tested;
 *   * **whether that is allowed** is decided by the database, which re-checks
 *     every invariant that must hold whatever produced the list (D-54);
 *   * **when the effect runs** is decided here, and it runs with the
 *     service-role key. A browser responds; the server applies what the
 *     responses produced. `apply_decision` is granted to `service_role` and to
 *     nobody else, so this is not a convention — it is the only door.
 *
 * Nothing in this file decides that a decision has passed. It reads the status
 * the database wrote, and acts on it.
 */

// ---------------------------------------------------------------------------
// Reading the Home
// ---------------------------------------------------------------------------

interface GovernanceContext {
  policy: GovernancePolicy;
  members: GovernanceMember[];
  names: Map<string, string>;
  autoConfirmHours: number;
}

function policyFrom(row: GovernancePolicyRow): GovernancePolicy {
  return {
    criticalRequiresCoadmin: row.critical_requires_coadmin,
    criticalMemberRule: row.critical_member_rule as "count" | "proportion",
    criticalMemberValue: row.critical_member_value,
    governanceRequiresAll: row.governance_requires_all,
    absenceApproverRoles: row.absence_approver_roles,
    joinApproverRoles: row.join_approver_roles,
    expenseApprovalsRequired: row.expense_approvals_required,
    decisionDeadlineDays: row.decision_deadline_days,
    absenceDeadlineHours: row.absence_deadline_hours,
  };
}

type MemberJoinRow = {
  id: string;
  role: GovernanceMember["role"];
  status: GovernanceMember["status"];
  member_kind: GovernanceMember["kind"];
  display_name: string | null;
  users: { display_name: string | null } | null;
};

/**
 * Everything the selector needs about a Home, in one round of queries.
 *
 * Every Home has a `governance_policy` row — migration 051 seeds the existing
 * ones and a trigger on `houses` seeds the rest — so a missing row is a defect
 * rather than a Home that has not been configured, and it is reported as one.
 */
export async function loadGovernanceContext(
  session: Session,
  houseId: string,
): Promise<GovernanceContext> {
  const [policyResult, membersResult, settingsResult] = await Promise.all([
    session.supabase
      .from("governance_policy")
      .select("*")
      .eq("house_id", houseId)
      .maybeSingle(),
    session.supabase
      .from("house_members")
      .select("id, role, status, member_kind, display_name, users(display_name)")
      .eq("house_id", houseId),
    session.supabase
      .from("house_settings")
      .select("auto_confirm_hours")
      .eq("house_id", houseId)
      .maybeSingle(),
  ]);

  if (policyResult.error) throw apiErrorFromPostgres(policyResult.error);
  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);
  if (settingsResult.error) throw apiErrorFromPostgres(settingsResult.error);
  if (!policyResult.data) throw new ApiError("INTERNAL");

  const rows = (membersResult.data ?? []) as unknown as MemberJoinRow[];

  return {
    policy: policyFrom(policyResult.data),
    members: rows.map((row) => ({
      id: row.id,
      role: row.role,
      status: row.status,
      kind: row.member_kind,
    })),
    names: new Map(
      rows.map((row) => [
        row.id,
        row.users?.display_name ?? row.display_name ?? "Unknown",
      ]),
    ),
    autoConfirmHours: settingsResult.data?.auto_confirm_hours ?? 48,
  };
}

// ---------------------------------------------------------------------------
// The view a screen renders
// ---------------------------------------------------------------------------

export interface DecisionParticipantView {
  memberId: string;
  displayName: string;
  capacity: ResponseCapacity;
  isMandatory: boolean;
  response: ResponseKind | null;
  reason: string | null;
  respondedAt: string | null;
}

export interface DecisionView {
  id: string;
  type: DecisionType;
  level: DecisionRow["level"];
  status: DecisionStatus;
  requestedBy: { memberId: string; displayName: string };
  subjectMember: { memberId: string; displayName: string } | null;
  subjectType: string | null;
  subjectId: string | null;
  payload: Json;
  result: Json | null;
  reason: string | null;
  deadline: string | null;
  autoApproved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  appliedAt: string | null;
  participants: DecisionParticipantView[];
  progress: {
    approvals: { given: number; required: number };
    acknowledgements: { given: number; required: number };
    outstanding: string[];
  };
  /** What this caller may do with it now, if anything. */
  viewer: {
    canRespond: boolean;
    capacity: ResponseCapacity | null;
    /** True when the caller's response finishes it — shown alone (AP-04). */
    completesOnMyResponse: boolean;
    canCancel: boolean;
    refusal: string | null;
  };
}

function recordFrom(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    type: row.type,
    level: row.level,
    status: row.status,
    requestedByMemberId: row.requested_by,
    subjectMemberId: row.subject_member_id,
    requiredApprovals: row.required_approvals,
    requiredAcks: row.required_acks,
    autoApproved: row.auto_approved,
    deadline: row.deadline ? new Date(row.deadline) : null,
  };
}

function participantsFrom(rows: DecisionParticipantRow[]): Participant[] {
  return rows.map((row) => ({
    memberId: row.member_id,
    capacity: row.capacity,
    isMandatory: row.is_mandatory,
  }));
}

function responsesFrom(rows: DecisionResponseRow[]): DecisionResponse[] {
  return rows.map((row) => ({
    memberId: row.member_id,
    capacity: row.capacity,
    response: row.response,
  }));
}

function toView(
  row: DecisionRow,
  participantRows: DecisionParticipantRow[],
  responseRows: DecisionResponseRow[],
  names: Map<string, string>,
  callerMemberId: string,
): DecisionView {
  const record = recordFrom(row);
  const participants = participantsFrom(participantRows);
  const responses = responsesFrom(responseRows);
  const progress = progressFor(record, participants, responses);
  const check = checkResponse(record, participants, responses, callerMemberId);

  const responseByKey = new Map(
    responseRows.map((response) => [
      `${response.member_id}:${response.capacity}`,
      response,
    ]),
  );

  const nameOf = (memberId: string) => names.get(memberId) ?? "Unknown";

  return {
    id: row.id,
    type: row.type,
    level: row.level,
    status: row.status,
    requestedBy: {
      memberId: row.requested_by,
      displayName: nameOf(row.requested_by),
    },
    subjectMember: row.subject_member_id
      ? {
          memberId: row.subject_member_id,
          displayName: nameOf(row.subject_member_id),
        }
      : null,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    payload: row.payload,
    result: row.result,
    reason: row.reason,
    deadline: row.deadline,
    autoApproved: row.auto_approved,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    appliedAt: row.applied_at,
    participants: participantRows.map((participant) => {
      const answer = responseByKey.get(
        `${participant.member_id}:${participant.capacity}`,
      );
      return {
        memberId: participant.member_id,
        displayName: nameOf(participant.member_id),
        capacity: participant.capacity,
        isMandatory: participant.is_mandatory,
        response: answer?.response ?? null,
        reason: answer?.reason ?? null,
        respondedAt: answer?.responded_at ?? null,
      };
    }),
    progress: {
      approvals: progress.approvals,
      acknowledgements: progress.acknowledgements,
      outstanding: progress.outstandingMandatory.map(nameOf),
    },
    viewer: {
      canRespond: !("refusal" in check),
      capacity: "refusal" in check ? null : check.capacity,
      completesOnMyResponse: "refusal" in check ? false : check.wouldComplete,
      canCancel: row.status === "waiting" && row.requested_by === callerMemberId,
      refusal: "refusal" in check ? check.refusal : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

interface DecisionBundle {
  rows: DecisionRow[];
  participantsByDecision: Map<string, DecisionParticipantRow[]>;
  responsesByDecision: Map<string, DecisionResponseRow[]>;
}

/**
 * The rows, their participants and their responses.
 *
 * Three queries rather than one nested select: the participant and response
 * tables have their own RLS policies, and reading them separately means a
 * caller who can see a decision but not its detail gets an empty list rather
 * than a decision that silently loses half its participants.
 */
async function loadBundle(
  session: Session,
  decisionIds: string[],
  rows: DecisionRow[],
): Promise<DecisionBundle> {
  if (decisionIds.length === 0) {
    return {
      rows,
      participantsByDecision: new Map(),
      responsesByDecision: new Map(),
    };
  }

  const [participantsResult, responsesResult] = await Promise.all([
    session.supabase
      .from("decision_participants")
      .select("*")
      .in("decision_id", decisionIds),
    session.supabase
      .from("decision_responses")
      .select("*")
      .in("decision_id", decisionIds),
  ]);

  if (participantsResult.error) throw apiErrorFromPostgres(participantsResult.error);
  if (responsesResult.error) throw apiErrorFromPostgres(responsesResult.error);

  const participantsByDecision = new Map<string, DecisionParticipantRow[]>();
  for (const row of participantsResult.data ?? []) {
    const list = participantsByDecision.get(row.decision_id) ?? [];
    list.push(row);
    participantsByDecision.set(row.decision_id, list);
  }

  const responsesByDecision = new Map<string, DecisionResponseRow[]>();
  for (const row of responsesResult.data ?? []) {
    const list = responsesByDecision.get(row.decision_id) ?? [];
    list.push(row);
    responsesByDecision.set(row.decision_id, list);
  }

  return { rows, participantsByDecision, responsesByDecision };
}

export interface DecisionListFilter {
  status?: DecisionStatus;
  /** `mine` is the Approvals surface: the ones still waiting on this caller. */
  scope?: "all" | "mine";
}

export interface DecisionListView {
  decisions: DecisionView[];
  /** What Approve All would act on right now, and what it would leave behind. */
  batch: { approvable: number; heldBack: { id: string; reason: string }[] };
}

export async function listDecisions(
  session: Session,
  houseId: string,
  callerMemberId: string,
  filter: DecisionListFilter = {},
): Promise<DecisionListView> {
  const context = await loadGovernanceContext(session, houseId);

  let query = session.supabase
    .from("decisions")
    .select("*")
    .eq("house_id", houseId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter.status) query = query.eq("status", filter.status);

  const { data, error } = await query;
  if (error) throw apiErrorFromPostgres(error);

  const rows = data ?? [];
  const bundle = await loadBundle(
    session,
    rows.map((row) => row.id),
    rows,
  );

  const views = rows.map((row) =>
    toView(
      row,
      bundle.participantsByDecision.get(row.id) ?? [],
      bundle.responsesByDecision.get(row.id) ?? [],
      context.names,
      callerMemberId,
    ),
  );

  const now = new Date();
  const candidates = rows
    .filter((row) => row.status === "waiting")
    .map((row) =>
      candidateFrom(
        recordFrom(row),
        participantsFrom(bundle.participantsByDecision.get(row.id) ?? []),
        responsesFrom(bundle.responsesByDecision.get(row.id) ?? []),
      ),
    );
  const plan = planBatch(candidates, callerMemberId, now);

  return {
    decisions:
      filter.scope === "mine" ? views.filter((view) => view.viewer.canRespond) : views,
    batch: {
      approvable: plan.approve.length,
      // Only the deliberate-action hold-backs are worth naming: the rest are
      // decisions the caller was never part of.
      heldBack: plan.skip
        .filter((entry) => entry.reason === "CRITICAL_NEEDS_DELIBERATE_ACTION")
        .map((entry) => ({ id: entry.id, reason: entry.reason })),
    },
  };
}

/**
 * How many decisions are still waiting on this one member.
 *
 * The tab bar asks this on every page load (AP-05), so it does not build the
 * queue to answer it: three narrow queries, and the rule that decides is the
 * pure `awaitsResponse`, shared with the screen so the badge and the list
 * cannot disagree. A decision past its deadline is not counted — the hourly
 * job has not marked it `lapsed` yet, but nobody's answer can change it now.
 */
export async function countDecisionsAwaiting(
  session: Session,
  houseId: string,
  callerMemberId: string,
): Promise<number> {
  const { data: rows, error } = await session.supabase
    .from("decisions")
    .select("id, status, deadline")
    .eq("house_id", houseId)
    .eq("status", "waiting")
    .limit(200);
  if (error) throw apiErrorFromPostgres(error);

  const ids = (rows ?? []).map((row) => row.id);
  if (ids.length === 0) return 0;

  const [participantsResult, responsesResult] = await Promise.all([
    session.supabase
      .from("decision_participants")
      .select("decision_id, capacity")
      .in("decision_id", ids)
      .eq("member_id", callerMemberId),
    session.supabase
      .from("decision_responses")
      .select("decision_id, capacity")
      .in("decision_id", ids)
      .eq("member_id", callerMemberId),
  ]);

  if (participantsResult.error) throw apiErrorFromPostgres(participantsResult.error);
  if (responsesResult.error) throw apiErrorFromPostgres(responsesResult.error);

  const capacities = new Map<string, ResponseCapacity[]>();
  for (const row of participantsResult.data ?? []) {
    capacities.set(row.decision_id, [
      ...(capacities.get(row.decision_id) ?? []),
      row.capacity,
    ]);
  }

  const responded = new Map<string, ResponseCapacity[]>();
  for (const row of responsesResult.data ?? []) {
    responded.set(row.decision_id, [
      ...(responded.get(row.decision_id) ?? []),
      row.capacity,
    ]);
  }

  const now = new Date();
  return (rows ?? []).filter((row) =>
    awaitsResponse({
      status: row.status,
      deadline: row.deadline ? new Date(row.deadline) : null,
      capacities: capacities.get(row.id) ?? [],
      responded: responded.get(row.id) ?? [],
      now,
    }),
  ).length;
}

export async function getDecision(
  session: Session,
  houseId: string,
  decisionId: string,
  callerMemberId: string,
): Promise<DecisionView> {
  const context = await loadGovernanceContext(session, houseId);

  const { data, error } = await session.supabase
    .from("decisions")
    .select("*")
    .eq("id", decisionId)
    .maybeSingle();
  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("DECISION_NOT_FOUND");

  const bundle = await loadBundle(session, [decisionId], [data]);
  return toView(
    data,
    bundle.participantsByDecision.get(decisionId) ?? [],
    bundle.responsesByDecision.get(decisionId) ?? [],
    context.names,
    callerMemberId,
  );
}

// ---------------------------------------------------------------------------
// Proposing
// ---------------------------------------------------------------------------

const REFUSAL_ERRORS = {
  SUBJECT_IS_PARTICIPANT: "SUBJECT_IS_PARTICIPANT",
  NOT_ENOUGH_PARTICIPANTS: "NOT_ENOUGH_PARTICIPANTS",
  NO_ACTIVE_MEMBERS: "NO_ACTIVE_MEMBERS",
} as const;

/**
 * `create_decision` raises `NOT_A_MEMBER`, which the catalogue does not carry
 * under that name. Everything else it raises is named there already.
 */
function governanceError(error: { message?: string | null; code?: string | null }) {
  if ((error.message ?? "").includes("NOT_A_MEMBER")) {
    return new ApiError("NOT_HOUSE_MEMBER");
  }
  return apiErrorFromPostgres(error);
}

export interface ProposalResult {
  decision: DecisionView;
  /** Whether the effect ran, and why not when it did not. */
  applied: boolean;
  applyRefusal: string | null;
  /**
   * What an effect could not finish inside its own transaction.
   *
   * One type sets this today. `effect_absence_request` opens the absent
   * member's chores — the database will not leave work on somebody the Home has
   * excused, whatever happens next — but choosing who takes them needs the
   * solver's eight hard constraints, which are TypeScript. So the opening is
   * atomic with the approval and the re-assignment follows it, and the counts
   * come back here so the screen can say where the work went.
   */
  followUp: { reassigned: number; opened: number } | null;
}

/**
 * Who may raise a Critical decision — spec §3.3, where every Critical row of
 * the matrix reads "Admin (proposer), Co-Admin".
 *
 * The gate is here rather than only on the old routes it replaces. Removal
 * asked for Admin before phase 11; if the proposal route left it open, the
 * check on `DELETE /api/members/:id` would be decoration, since the same
 * removal could be started by anybody through `POST /api/decisions`. It admits
 * a Co-Admin as well as an Admin: a Co-Admin is mandatory on every Critical
 * decision anyway, so one who proposes is not reaching past anybody.
 */
function assertMayPropose(
  level: DecisionLevel,
  members: GovernanceMember[],
  callerMemberId: string,
): void {
  if (level !== "critical") return;
  const caller = members.find((member) => member.id === callerMemberId);
  if (caller?.role !== "admin" && caller?.role !== "co_admin") {
    throw new ApiError("LEAD_REQUIRED");
  }
}

/**
 * Who would be asked, and how many answers it needs — S-37's sheet.
 *
 * A read: it writes nothing and creates nothing, so a person can see the cost
 * of asking before they ask. It runs the same selector the proposal itself
 * will, so what the sheet promises is what the decision is made of, and it
 * raises the same refusals — a proposal that cannot be made is refused here
 * rather than at the moment somebody taps Submit.
 */
export interface ProposalPreview extends ProposalAsk {
  participants: {
    memberId: string;
    displayName: string;
    capacity: ResponseCapacity;
    isMandatory: boolean;
  }[];
  reasonRequired: boolean;
}

export async function previewProposal(
  session: Session,
  houseId: string,
  callerMemberId: string,
  input: PreviewDecisionInput,
): Promise<ProposalPreview> {
  const context = await loadGovernanceContext(session, houseId);

  const selection = selectParticipants({
    proposal: {
      type: input.type,
      proposerId: callerMemberId,
      subjectMemberId: input.subject_member_id,
    },
    members: context.members,
    policy: context.policy,
    autoConfirmHours: context.autoConfirmHours,
  });

  if ("refusal" in selection) {
    throw new ApiError(REFUSAL_ERRORS[selection.refusal]);
  }

  const requirement = selection.requirement;
  assertMayPropose(requirement.level, context.members, callerMemberId);

  return {
    ...askFrom(requirement),
    participants: requirement.participants.map((participant) => ({
      memberId: participant.memberId,
      displayName: context.names.get(participant.memberId) ?? "Unknown",
      capacity: participant.capacity,
      isMandatory: participant.isMandatory,
    })),
    reasonRequired: reasonRequired(requirement.level),
  };
}

export async function proposeDecision(
  session: Session,
  houseId: string,
  callerMemberId: string,
  input: ProposeDecisionInput,
): Promise<ProposalResult> {
  const context = await loadGovernanceContext(session, houseId);

  const selection = selectParticipants({
    proposal: {
      type: input.type,
      proposerId: callerMemberId,
      subjectMemberId: input.subject_member_id,
    },
    members: context.members,
    policy: context.policy,
    autoConfirmHours: context.autoConfirmHours,
  });

  if ("refusal" in selection) {
    throw new ApiError(REFUSAL_ERRORS[selection.refusal]);
  }

  const requirement = selection.requirement;
  assertMayPropose(requirement.level, context.members, callerMemberId);

  if (requirement.level === "critical" && !input.reason) {
    throw new ApiError("REASON_REQUIRED");
  }

  // E-84. A draw for more than the pot holds is refused here rather than at
  // apply time, so the Home is never asked to approve something that cannot
  // happen. The database refuses it again under `for update`, because a
  // decision approved on Tuesday can be applied on Friday.
  if (input.type === "reserve_draw") {
    await assertDrawIsPossible(session, houseId, input.payload ?? {});
  }

  const deadlineHours =
    requirement.deadlineHours ??
    deadlineHoursFor(input.type, context.policy, context.autoConfirmHours);
  const deadline =
    deadlineHours === null
      ? null
      : new Date(Date.now() + deadlineHours * 3_600_000).toISOString();

  const { data: created, error } = await session.supabase.rpc("create_decision", {
    p_house_id: houseId,
    p_type: input.type,
    p_level: requirement.level,
    p_participants: requirement.participants.map((participant) => ({
      member_id: participant.memberId,
      capacity: participant.capacity,
      is_mandatory: participant.isMandatory,
    })) as unknown as Json,
    p_required_approvals: requirement.requiredApprovals,
    p_required_acks: requirement.requiredAcks,
    p_subject_type: input.subject_type,
    p_subject_id: input.subject_id,
    p_subject_member_id: input.subject_member_id,
    p_payload: (input.payload ?? {}) as Json,
    p_reason: input.reason,
    p_deadline: deadline ?? undefined,
    p_supersedes_id: input.supersedes_id,
  });

  if (error) throw governanceError(error);
  const row = created as unknown as DecisionRow;

  // The proposer's proposal is their approval (§3.3). They are listed as a
  // participant on a Critical decision, so the response is written here rather
  // than waiting for them to answer their own question — and it is written
  // through the caller's own client, so the insert policy applies to it like
  // any other response.
  const asParticipant = requirement.participants.find(
    (participant) => participant.memberId === callerMemberId,
  );
  if (asParticipant && row.status === "waiting") {
    const { error: responseError } = await session.supabase
      .from("decision_responses")
      .insert({
        decision_id: row.id,
        member_id: callerMemberId,
        capacity: asParticipant.capacity,
        response: affirmativeFor(asParticipant.capacity),
      });
    if (responseError) throw apiErrorFromPostgres(responseError);
  }

  return finish(session, houseId, row.id, callerMemberId);
}

/**
 * Reads the pot and the cost, and refuses the proposal if the one cannot cover
 * the other. The amount is the expense's own amount and is never taken from the
 * payload: a draw pays a specific cost, and a payload that could disagree with
 * it would be a second answer to "how much did this cost".
 */
async function assertDrawIsPossible(
  session: Session,
  houseId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const reserveId = typeof payload.reserve_id === "string" ? payload.reserve_id : null;
  const expenseId = typeof payload.expense_id === "string" ? payload.expense_id : null;
  if (!reserveId || !expenseId) throw new ApiError("VALIDATION_FAILED");

  const [reserve, expense] = await Promise.all([
    session.supabase
      .from("reserves")
      .select("balance_paise, active")
      .eq("house_id", houseId)
      .eq("id", reserveId)
      .maybeSingle(),
    session.supabase
      .from("expenses")
      .select("amount_paise, status, reserve_id")
      .eq("house_id", houseId)
      .eq("id", expenseId)
      .maybeSingle(),
  ]);

  if (reserve.error) throw apiErrorFromPostgres(reserve.error);
  if (expense.error) throw apiErrorFromPostgres(expense.error);
  if (!reserve.data || !reserve.data.active) throw new ApiError("RESERVE_NOT_FOUND");
  if (!expense.data) throw new ApiError("NOT_FOUND");
  if (expense.data.status !== "approved") throw new ApiError("VALIDATION_FAILED");
  if (expense.data.reserve_id) throw new ApiError("VALIDATION_FAILED");

  const refusal = reserveDrawRefusal(
    reserve.data.balance_paise,
    expense.data.amount_paise,
  );
  if (refusal) {
    throw new ApiError("INSUFFICIENT_RESERVE", {
      message: refusal,
      balance_paise: reserve.data.balance_paise,
      amount_paise: expense.data.amount_paise,
    });
  }
}

// ---------------------------------------------------------------------------
// Responding
// ---------------------------------------------------------------------------

export async function respondToDecision(
  session: Session,
  houseId: string,
  decisionId: string,
  callerMemberId: string,
  input: RespondInput,
): Promise<ProposalResult> {
  const current = await getDecision(session, houseId, decisionId, callerMemberId);

  if (current.status !== "waiting") throw new ApiError("ALREADY_RESOLVED");

  const mine = current.participants.filter(
    (participant) => participant.memberId === callerMemberId,
  );
  if (mine.length === 0) throw new ApiError("NOT_A_PARTICIPANT");

  const capacity =
    input.capacity ??
    mine.find((participant) => participant.response === null)?.capacity;
  if (!capacity) throw new ApiError("ALREADY_RESPONDED");

  const slot = mine.find((participant) => participant.capacity === capacity);
  if (!slot) throw new ApiError("NOT_A_PARTICIPANT");
  if (slot.response !== null) throw new ApiError("ALREADY_RESPONDED");

  // An acknowledger accepts that something is happening; they were never asked
  // whether it should (§2). The check constraint refuses this too — this is
  // the half that produces a sentence rather than a constraint violation.
  if (capacity === "acknowledger" && input.response !== "acknowledge") {
    throw new ApiError("NOT_A_PARTICIPANT", { capacity }, "You were asked to acknowledge this, not to approve it");
  }
  if (capacity === "approver" && input.response === "acknowledge") {
    throw new ApiError("NOT_A_PARTICIPANT", { capacity }, "You were asked to approve this, not to acknowledge it");
  }
  if (input.response === "reject" && !input.reason) {
    throw new ApiError("REASON_REQUIRED");
  }

  const { error } = await session.supabase.from("decision_responses").insert({
    decision_id: decisionId,
    member_id: callerMemberId,
    capacity,
    response: input.response,
    reason: input.reason ?? null,
  });
  if (error) throw apiErrorFromPostgres(error);

  return finish(session, houseId, decisionId, callerMemberId);
}

// ---------------------------------------------------------------------------
// Approve All
// ---------------------------------------------------------------------------

export interface BatchResult {
  approved: string[];
  skipped: { id: string; reason: string }[];
  applied: string[];
}

/**
 * Approve All — §5.
 *
 * The batch is planned by the domain, not by this function and not by the
 * client: a Critical decision that would complete on the caller's tap is left
 * out and shown on its own. The plan is recomputed here from rows read a
 * moment ago, and a response that races another member's is refused by the
 * insert policy rather than by this list — which is why a failed insert only
 * drops that one decision from the batch.
 */
export async function approveAll(
  session: Session,
  houseId: string,
  callerMemberId: string,
): Promise<BatchResult> {
  const { data, error } = await session.supabase
    .from("decisions")
    .select("*")
    .eq("house_id", houseId)
    .eq("status", "waiting");
  if (error) throw apiErrorFromPostgres(error);

  const rows = data ?? [];
  const bundle = await loadBundle(
    session,
    rows.map((row) => row.id),
    rows,
  );

  const byId = new Map(rows.map((row) => [row.id, row]));
  const plan = planBatch(
    rows.map((row) =>
      candidateFrom(
        recordFrom(row),
        participantsFrom(bundle.participantsByDecision.get(row.id) ?? []),
        responsesFrom(bundle.responsesByDecision.get(row.id) ?? []),
      ),
    ),
    callerMemberId,
    new Date(),
  );

  const approved: string[] = [];
  const skipped: { id: string; reason: string }[] = plan.skip.map((entry) => ({
    id: entry.id,
    reason: entry.reason,
  }));

  for (const entry of plan.approve) {
    const { error: insertError } = await session.supabase
      .from("decision_responses")
      .insert({
        decision_id: entry.id,
        member_id: callerMemberId,
        capacity: entry.capacity,
        response: affirmativeFor(entry.capacity),
      });

    if (insertError) {
      skipped.push({ id: entry.id, reason: "RESPONSE_REFUSED" });
      continue;
    }
    approved.push(entry.id);
  }

  const applied: string[] = [];
  for (const id of approved) {
    const row = byId.get(id);
    const outcome = await applyIfApproved(session, id, row?.house_id ?? houseId);
    if (!outcome.applied) continue;
    applied.push(id);

    // The same follow-up the single-response path runs. A batch is the most
    // likely way an absence gets approved — it is one line in a queue of
    // eight — so leaving it out here would mean the chores of most approved
    // absences stayed in the open pool.
    await afterApply(
      session,
      houseId,
      await getDecision(session, houseId, id, callerMemberId),
    );
  }

  return { approved, skipped, applied };
}

// ---------------------------------------------------------------------------
// Withdrawing
// ---------------------------------------------------------------------------

export async function cancelDecision(
  session: Session,
  houseId: string,
  decisionId: string,
  callerMemberId: string,
): Promise<DecisionView> {
  const { error } = await session.supabase.rpc("cancel_decision", {
    p_decision_id: decisionId,
  });
  if (error) throw governanceError(error);
  return getDecision(session, houseId, decisionId, callerMemberId);
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

interface ApplyOutcome {
  applied: boolean;
  refusal: string | null;
}

/**
 * Runs the effect if — and only if — the database says the decision is
 * approved.
 *
 * Two things this deliberately does not do. It does not decide that a decision
 * has passed: `resolve_decision` wrote the status from the rows, and
 * `apply_decision` re-derives every check from those same rows before running
 * anything. And it does not fail the caller's request when the effect refuses:
 * a member who approved a settlement close should not receive a 500 because
 * the close effect is not built yet. The decision stays `approved` and visibly
 * unapplied, which is the honest state, and the refusal is reported alongside
 * it.
 */
async function applyIfApproved(
  session: Session,
  decisionId: string,
  houseId: string,
): Promise<ApplyOutcome> {
  const { data, error } = await session.supabase
    .from("decisions")
    .select("id, status, house_id, type, subject_id, payload")
    .eq("id", decisionId)
    .maybeSingle();
  if (error) throw apiErrorFromPostgres(error);
  if (!data || data.house_id !== houseId) return { applied: false, refusal: null };
  if (data.status === "applied") return { applied: true, refusal: null };
  if (data.status !== "approved") return { applied: false, refusal: null };

  const admin = createAdminClient();

  /**
   * N-37. The effect ran inside `apply_decision`'s transaction and that
   * transaction is gone, so a notification written there would have gone with
   * it. This is the only place the failure still exists (migration 055).
   */
  const reportRefusal = async (refusal: string, detail: string) => {
    console.error("[governance] apply refused", decisionId, detail);
    const { error: notifyError } = await admin.rpc("notify_apply_refused", {
      p_decision_id: decisionId,
      p_reason: refusal,
    });
    if (notifyError) {
      console.error("[governance] N-37 not written", decisionId, notifyError.message);
    }
    return { applied: false, refusal };
  };

  // The apply-time numbers, for the one decision type that needs them. D-59 and
  // migration 071: the close is proposed against a month and applied against
  // whatever that month turned out to contain, so the arithmetic runs now
  // rather than when somebody tapped Close.
  let input: Json = {} as Json;
  if (data.type === "close_settlement" && data.subject_id) {
    const payload = (data.payload ?? {}) as { shadow_mode?: boolean };
    try {
      input = (await closeSettlementInput(session, houseId, data.subject_id, {
        shadowMode: Boolean(payload.shadow_mode),
      })) as unknown as Json;
    } catch (failure) {
      // A month that can no longer be closed leaves the decision approved and
      // visibly unapplied, exactly as a refused effect would.
      const refusal = failure instanceof ApiError ? failure.code : "CLOSE_INPUT_FAILED";
      return reportRefusal(refusal, String(failure));
    }
  }

  const { error: applyError } = await admin.rpc("apply_decision", {
    p_decision_id: decisionId,
    p_input: input,
  });

  if (applyError) {
    return reportRefusal(apiErrorFromPostgres(applyError).code, applyError.message);
  }

  return { applied: true, refusal: null };
}

/**
 * The half of an effect that could not run inside `apply_decision`.
 *
 * Kept to one dispatcher rather than spread through the route handlers that
 * happen to complete a decision, because the member who *finishes* an absence
 * is almost never the member who asked for it: the follow-up has to run
 * wherever the last response lands, which is `respond`, `approveAll` and
 * `propose` alike.
 *
 * It never throws. The decision is applied and recorded by the time this runs,
 * and a failure to find takers for opened chores must not turn a successful
 * approval into a 500 — the chores stay open, which is the safe state.
 */
async function afterApply(
  session: Session,
  houseId: string,
  decision: DecisionView,
): Promise<ProposalResult["followUp"]> {
  if (decision.status !== "applied") return null;

  if (decision.type === "absence_request") {
    // Read from `result` rather than `payload`: the payload is what was
    // proposed, the result is what the effect actually wrote.
    const result = decision.result as {
      member_id?: string;
      from_date?: string;
      to_date?: string;
    } | null;

    if (!result?.member_id || !result.from_date || !result.to_date) return null;

    try {
      return await fillOpenedDays(
        session,
        houseId,
        result.member_id,
        result.from_date,
        result.to_date,
      );
    } catch (failure) {
      console.error("[governance] follow-up failed", decision.id, failure);
      return null;
    }
  }

  return null;
}

/** Read the decision back, apply it if it now passes, and read it back again. */
async function finish(
  session: Session,
  houseId: string,
  decisionId: string,
  callerMemberId: string,
): Promise<ProposalResult> {
  const outcome = await applyIfApproved(session, decisionId, houseId);
  const decision = await getDecision(session, houseId, decisionId, callerMemberId);
  const followUp = await afterApply(session, houseId, decision);
  return {
    decision,
    applied: outcome.applied,
    applyRefusal: outcome.refusal,
    followUp,
  };
}

export { applyIfApproved };
