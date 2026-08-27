import type { Session } from "@/lib/data/house";
import {
  SCHEDULE_MAX_TOKENS,
  SCHEDULE_RESPONSE_SCHEMA,
  SCHEDULE_SYSTEM_PROMPT,
  SCHEDULE_TEMPERATURE,
  buildSchedulePayload,
  validateProposal,
  type HistoryEntry,
  type ProposalContext,
  type ScheduleProposal,
  type TranslatedAssignment,
} from "@/lib/domain/llm/schedule";
import { resolveLlm } from "@/lib/infra/llm/resolve";

/**
 * The schedule overlay — docs/10-LLM-SPEC.md section 5.
 *
 * Called only after the deterministic solver has produced a valid schedule, and
 * only when `house_settings.llm_scheduling_enabled` is true. Everything it can
 * do is bounded by one rule: if the proposal fails any check, the engine's
 * schedule is published unchanged and nobody is told anything went wrong.
 */

export interface OverlayInput extends ProposalContext {
  names: Map<string, string>;
  awayDatesByMember: Map<string, string[]>;
  guests: { guestId: string; name: string; hostMemberId: string; dates: string[] }[];
}

export interface OverlayResult {
  accepted: boolean;
  assignments: TranslatedAssignment[] | null;
  rationale: string | null;
  errors: string[];
  maxDeviation: number | null;
}

export async function proposeWithLlm(
  session: Session,
  houseId: string,
  input: OverlayInput,
): Promise<OverlayResult | null> {
  const provider = await resolveLlm(houseId);
  if (!provider) return null;

  const history = await recentHistory(session, houseId, input.weekStart);

  const { payload, maps } = buildSchedulePayload({
    ...input,
    canCookByMember: new Map(input.members.map((m) => [m.memberId, m.canCook])),
    roomByMember: new Map(input.members.map((m) => [m.memberId, m.roomId])),
    history,
  });

  const result = await provider.complete<ScheduleProposal>({
    purpose: "schedule",
    system: SCHEDULE_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
    schema: SCHEDULE_RESPONSE_SCHEMA,
    maxTokens: SCHEDULE_MAX_TOKENS,
    temperature: SCHEDULE_TEMPERATURE,
  });

  // A failed call is handled exactly as an invalid proposal is: the engine's
  // schedule is what gets published, and the reason is in `llm_runs`.
  if (!result.ok || !result.data) {
    return {
      accepted: false,
      assignments: null,
      rationale: null,
      errors: [result.error ?? "CALL_FAILED"],
      maxDeviation: null,
    };
  }

  const validation = validateProposal(result.data, maps, input);

  return {
    accepted: validation.valid,
    assignments: validation.valid ? validation.assignments : null,
    rationale: validation.valid ? result.data.rationale : null,
    errors: validation.errors,
    maxDeviation: validation.maxDeviation,
  };
}

/**
 * The last four weeks of who did what — section 5.2's `history`.
 *
 * Only confirmed work: what somebody was assigned and did not do says nothing
 * about whether they have had the bathroom three weeks running.
 */
async function recentHistory(
  session: Session,
  houseId: string,
  weekStart: string,
): Promise<HistoryEntry[]> {
  const from = shift(weekStart, -28);
  const to = shift(weekStart, -1);

  const { data, error } = await session.supabase
    .from("chore_assignments")
    .select("assignee_member_id, chore_date, chore_templates ( name )")
    .eq("house_id", houseId)
    .eq("status", "confirmed")
    .gte("chore_date", from)
    .lte("chore_date", to);

  if (error || !data) return [];

  type Row = {
    assignee_member_id: string | null;
    chore_date: string;
    chore_templates: { name: string } | null;
  };

  return (data as unknown as Row[])
    .filter((row) => row.assignee_member_id !== null)
    .map((row) => ({
      memberId: row.assignee_member_id!,
      chore: row.chore_templates?.name ?? "Chore",
      weeksAgo: Math.max(1, Math.ceil(daysBetween(row.chore_date, weekStart) / 7)),
    }));
}

function shift(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}
