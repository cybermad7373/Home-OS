import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { absenceImpact, impactPhrase, type AbsenceImpact } from "@/lib/domain/absence";
import {
  previewProposal,
  proposeDecision,
  cancelDecision,
  type DecisionView,
  type ProposalPreview,
} from "./governance";
import type { Session } from "./house";
import type { AbsenceRequestRow, AbsenceStatusName } from "@/lib/types/database";
import type { AbsenceInput } from "@/lib/validation/absence";

/**
 * The absence repository — AV-05 to AV-09, and phase 11 slice 3.
 *
 * An away day used to be a declaration. It is a request now, because it moves
 * work onto other people and lowers a target that money is calculated from at
 * month end. What did *not* change is the other two exception kinds: "home all
 * day" and "different hours" cost the Home nothing and still go straight
 * through `POST /api/availability/exceptions`.
 *
 * The order of operations here is the whole of the design:
 *
 *   1. the request row, written by the member for themselves;
 *   2. the decision, which names the approvers and starts the clock;
 *   3. nothing else, until somebody approves.
 *
 * Step 3 is the part worth defending. An absence that took effect while it was
 * still being considered would make AV-06 unenforceable — there would be no
 * difference left between an excused absence and simply not showing up.
 */

export interface AbsenceView {
  id: string;
  memberId: string;
  memberName: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: AbsenceStatusName;
  decidedAt: string | null;
  createdAt: string;
  /** The decision that is deciding it, when one is still open. */
  decisionId: string | null;
}

type AbsenceRow = AbsenceRequestRow & {
  house_members: { id: string; users: { display_name: string } | null } | null;
};

const ABSENCE_SELECT = `
  *,
  house_members ( id, users ( display_name ) )
`;

function toView(row: AbsenceRow, decisionId: string | null): AbsenceView {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.house_members?.users?.display_name ?? "Someone",
    fromDate: row.from_date,
    toDate: row.to_date,
    reason: row.reason,
    status: row.status,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    decisionId,
  };
}

/**
 * The Home's absences over a range, newest request first.
 *
 * Read through RLS, which admits every member: an absence is not private
 * information, it is the reason somebody else is doing the washing up.
 */
export async function listAbsences(
  session: Session,
  houseId: string,
  options: { memberId?: string; from?: string } = {},
): Promise<AbsenceView[]> {
  let query = session.supabase
    .from("absence_requests")
    .select(ABSENCE_SELECT)
    .eq("house_id", houseId)
    .order("created_at", { ascending: false });

  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.from) query = query.gte("to_date", options.from);

  const { data, error } = await query;
  if (error) throw apiErrorFromPostgres(error);

  const rows = (data ?? []) as unknown as AbsenceRow[];
  if (rows.length === 0) return [];

  // One extra read rather than a join: `decisions.subject_id` is polymorphic,
  // so there is no foreign key for PostgREST to embed across.
  const { data: decisions, error: decisionError } = await session.supabase
    .from("decisions")
    .select("id, subject_id, status")
    .eq("house_id", houseId)
    .eq("type", "absence_request")
    .in(
      "subject_id",
      rows.map((row) => row.id),
    );
  if (decisionError) throw apiErrorFromPostgres(decisionError);

  const byAbsence = new Map<string, string>();
  for (const decision of decisions ?? []) {
    if (decision.subject_id) byAbsence.set(decision.subject_id, decision.id);
  }

  return rows.map((row) => toView(row, byAbsence.get(row.id) ?? null));
}

export interface AbsencePreview {
  impact: AbsenceImpact;
  /** The one line the sheet leads with. */
  summary: string;
  /** Who would be asked, and how many of them have to answer. */
  ask: ProposalPreview;
}

/**
 * AV-08 — exactly which chores and how many points, before it is submitted.
 *
 * Two reads and no writes. The chore half is what the member loses; the ask
 * half is what they are about to spend somebody else's attention on. Both are
 * shown together because a person deciding whether to bother asking needs both
 * numbers at once.
 */
export async function previewAbsence(
  session: Session,
  houseId: string,
  memberId: string,
  from: string,
  to: string,
): Promise<AbsencePreview> {
  const [choresResult, ask] = await Promise.all([
    session.supabase
      .from("chore_assignments")
      .select(
        "id, chore_date, slot, effort_points, status, guest_id, chore_templates ( name )",
      )
      .eq("house_id", houseId)
      .eq("assignee_member_id", memberId)
      .gte("chore_date", from)
      .lte("chore_date", to)
      .neq("status", "cancelled")
      .order("chore_date")
      .order("slot"),
    previewProposal(session, houseId, memberId, {
      type: "absence_request",
      subject_member_id: memberId,
    }),
  ]);

  if (choresResult.error) throw apiErrorFromPostgres(choresResult.error);

  type Row = {
    id: string;
    chore_date: string;
    slot: "morning" | "evening" | "any";
    effort_points: number;
    status: string;
    guest_id: string | null;
    chore_templates: { name: string } | null;
  };

  const impact = absenceImpact(
    from,
    to,
    ((choresResult.data ?? []) as unknown as Row[]).map((row) => ({
      assignmentId: row.id,
      date: row.chore_date,
      name: row.chore_templates?.name ?? "Chore",
      slot: row.slot,
      effortPoints: row.effort_points,
      status: row.status,
      isGuestChore: row.guest_id !== null,
    })),
  );

  return { impact, summary: impactPhrase(impact), ask };
}

export interface AbsenceResult {
  absence: AbsenceView;
  decision: DecisionView;
  /** True when the Home had nobody to ask and it took effect on the spot. */
  applied: boolean;
  /** Where the work went, when it went anywhere. */
  redistribution: { reassigned: number; opened: number } | null;
}

/**
 * Ask the Home for time away.
 *
 * The compensating delete is the one piece of bookkeeping worth explaining. A
 * request row has to exist before the decision can point at it, so there is a
 * window in which the row exists and the decision does not. If the proposal is
 * refused — no approver in the Home, a Critical gate, a validation failure —
 * that row would sit `waiting` forever and block the overlap check on every
 * later request. It is deleted through the caller's own client, and it can only
 * ever be a row this call just created, in `waiting`, belonging to the caller.
 */
export async function requestAbsence(
  session: Session,
  houseId: string,
  memberId: string,
  input: AbsenceInput,
): Promise<AbsenceResult> {
  const { data: inserted, error } = await session.supabase
    .from("absence_requests")
    .insert({
      house_id: houseId,
      member_id: memberId,
      from_date: input.from_date,
      to_date: input.to_date,
      reason: input.reason ?? null,
    })
    .select(ABSENCE_SELECT)
    .single();

  if (error) throw absenceError(error);
  const row = inserted as unknown as AbsenceRow;

  let proposal;
  try {
    proposal = await proposeDecision(session, houseId, memberId, {
      type: "absence_request",
      subject_type: "absence_request",
      subject_id: row.id,
      subject_member_id: memberId,
      payload: {
        from_date: input.from_date,
        to_date: input.to_date,
      },
      reason: input.reason,
    });
  } catch (failure) {
    await session.supabase
      .from("absence_requests")
      .delete()
      .eq("id", row.id)
      .eq("status", "waiting");
    throw failure;
  }

  return {
    absence: toView(row, proposal.decision.id),
    decision: proposal.decision,
    applied: proposal.applied,
    // Set only when the proposal approved on the spot — a lead in a Home with
    // no other approver. Every other absence is redistributed by whoever
    // approves it, through the same follow-up in `lib/data/governance.ts`.
    redistribution: proposal.followUp,
  };
}

/**
 * Withdraw a request that has not been answered.
 *
 * It cancels the decision rather than the request: the decision is what people
 * were asked, and the trigger in migration 057 moves the request with it. Doing
 * it the other way round would leave a live question about a request that no
 * longer exists.
 */
export async function withdrawAbsence(
  session: Session,
  houseId: string,
  absenceId: string,
  callerMemberId: string,
): Promise<AbsenceView> {
  const { data, error } = await session.supabase
    .from("absence_requests")
    .select(ABSENCE_SELECT)
    .eq("id", absenceId)
    .eq("house_id", houseId)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");

  const row = data as unknown as AbsenceRow;
  if (row.member_id !== callerMemberId) throw new ApiError("NOT_YOUR_RECORD");
  if (row.status !== "waiting") throw new ApiError("ALREADY_RESOLVED");

  const { data: decision, error: decisionError } = await session.supabase
    .from("decisions")
    .select("id")
    .eq("house_id", houseId)
    .eq("type", "absence_request")
    .eq("subject_id", absenceId)
    .maybeSingle();
  if (decisionError) throw apiErrorFromPostgres(decisionError);
  if (!decision) throw new ApiError("NOT_FOUND");

  await cancelDecision(session, houseId, decision.id, callerMemberId);

  const { data: after, error: afterError } = await session.supabase
    .from("absence_requests")
    .select(ABSENCE_SELECT)
    .eq("id", absenceId)
    .single();
  if (afterError) throw apiErrorFromPostgres(afterError);

  return toView(after as unknown as AbsenceRow, decision.id);
}

function absenceError(error: { message?: string | null; code?: string | null }) {
  const message = error.message ?? "";
  if (message.includes("ABSENCE_PAST")) return new ApiError("EXCEPTION_PAST");
  if (message.includes("ABSENCE_OVERLAPS")) return new ApiError("ABSENCE_OVERLAPS");
  return apiErrorFromPostgres(error);
}
