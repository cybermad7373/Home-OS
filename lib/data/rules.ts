import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { diffVersions, type RuleFieldChange, type RuleSnapshot } from "@/lib/domain/rules/diff";
import type {
  RuleAction,
  RuleAppliesTo,
  RuleChangeAction,
  RuleCondition,
  RuleParseSource,
  RuleStatus,
} from "@/lib/domain/rules/types";
import type { RuleParseContext } from "@/lib/domain/rules/parse";
import { OpaqueIds } from "@/lib/infra/llm/redact";
import { proposeDecision, type DecisionView } from "./governance";
import type { Session } from "./house";
import type { HomeRuleRow, HomeRuleVersionRow } from "@/lib/types/database";
import type {
  CreateRuleInput,
  DisableRuleInput,
  UpdateRuleInput,
} from "@/lib/validation/rules";

/**
 * The rules repository — RL-01 to RL-10, docs/14-GOVERNANCE-SPEC.md section 6.
 *
 * The order of operations is the whole of the design, and it is the same order
 * `lib/data/absence.ts` uses for the same reason:
 *
 *   1. the pending version row, written by a lead through their own client;
 *   2. the `change_rule` decision, which names who is asked and starts a clock;
 *   3. nothing else, until the Home answers.
 *
 * Step 3 is the part worth defending. A rule that took effect while it was
 * still being considered would make RL-04 unenforceable — there would be no
 * difference left between a rule the Home agreed to and a rule an Admin typed.
 * The database says the same thing from its own side: `activated_at` cannot be
 * set without a `decision_id`, and the only function that sets either is
 * `effect_change_rule`.
 */

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface RuleVersionView {
  id: string;
  versionNo: number;
  originalText: string;
  parsedBy: RuleParseSource;
  title: string;
  condition: RuleCondition;
  action: RuleAction;
  appliesTo: RuleAppliesTo;
  weightPoints: number | null;
  penaltyPaise: number | null;
  startsOn: string | null;
  endsOn: string | null;
  changeReason: string | null;
  decisionId: string | null;
  activatedAt: string | null;
  supersededAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface RuleView {
  id: string;
  title: string;
  status: RuleStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** The version in force. Null on a rule whose first version is still pending. */
  current: RuleVersionView | null;
  /**
   * The decision the Home is still answering, when there is one. The current
   * version stays in force underneath it, which is what S-40's "Waiting for the
   * house" chip means.
   */
  pending: { decisionId: string; versionId: string; action: RuleChangeAction } | null;
}

export interface RuleHistoryEntry {
  version: RuleVersionView;
  /** Field by field, against the version before it (RL-07). Empty on version 1. */
  changes: RuleFieldChange[];
  /** Who acknowledged or approved the decision that activated it, and when. */
  responses: { memberId: string; memberName: string; response: string; at: string }[];
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

const VERSION_SELECT = `
  id, rule_id, version_no, original_text, parsed_by, title, condition, action,
  applies_to, weight_points, penalty_paise, starts_on, ends_on, change_reason,
  decision_id, activated_at, superseded_at, created_by, created_at,
  house_members ( id, users ( display_name ) )
`;

/**
 * The version row plus the one join the list and the history both need.
 * `decisions.subject_id` is polymorphic and has no foreign key, so the author
 * of a version is the only thing PostgREST can embed here.
 */
type VersionRow = HomeRuleVersionRow & {
  house_members: { id: string; users: { display_name: string } | null } | null;
};

type RuleRow = Pick<
  HomeRuleRow,
  "id" | "title" | "status" | "sort_order" | "created_at" | "updated_at" | "current_version_id"
>;

function versionView(row: VersionRow): RuleVersionView {
  return {
    id: row.id,
    versionNo: row.version_no,
    originalText: row.original_text,
    parsedBy: row.parsed_by,
    title: row.title,
    // The three structured halves are `jsonb`, so the generated type is `Json`
    // and the cast is unavoidable. It is safe in the direction that matters:
    // every write goes through `lib/validation/rules.ts`, and every read that
    // predates a kind falls back to one the renderer knows.
    condition: (row.condition ?? { kind: "other" }) as unknown as RuleCondition,
    action: (row.action ?? { kind: "other" }) as unknown as RuleAction,
    appliesTo: (row.applies_to ?? { kind: "all" }) as unknown as RuleAppliesTo,
    weightPoints: row.weight_points,
    penaltyPaise: row.penalty_paise,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    changeReason: row.change_reason,
    decisionId: row.decision_id,
    activatedAt: row.activated_at,
    supersededAt: row.superseded_at,
    createdBy: row.created_by,
    createdByName: row.house_members?.users?.display_name ?? "Someone",
    createdAt: row.created_at,
  };
}

function snapshot(view: RuleVersionView): RuleSnapshot {
  return {
    versionNo: view.versionNo,
    title: view.title,
    originalText: view.originalText,
    condition: view.condition,
    action: view.action,
    appliesTo: view.appliesTo,
    weightPoints: view.weightPoints,
    penaltyPaise: view.penaltyPaise,
    startsOn: view.startsOn,
    endsOn: view.endsOn,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Every rule in the Home with its current version, in display order.
 *
 * Read through RLS, which admits every member. A rule only its author can see
 * is not a house rule — and RL-07's history has to be answerable by the people
 * bound by it, not only by the person who wrote it.
 */
export async function listRules(session: Session, houseId: string): Promise<RuleView[]> {
  const { data, error } = await session.supabase
    .from("home_rules")
    .select("id, title, status, sort_order, created_at, updated_at, current_version_id")
    .eq("house_id", houseId)
    .order("sort_order")
    .order("created_at");

  if (error) throw apiErrorFromPostgres(error);
  const rules = (data ?? []) as unknown as RuleRow[];
  if (rules.length === 0) return [];

  const { data: versionData, error: versionError } = await session.supabase
    .from("home_rule_versions")
    .select(VERSION_SELECT)
    .eq("house_id", houseId)
    .in(
      "rule_id",
      rules.map((rule) => rule.id),
    )
    .order("version_no", { ascending: false });

  if (versionError) throw apiErrorFromPostgres(versionError);
  const versions = (versionData ?? []) as unknown as VersionRow[];

  const byId = new Map(versions.map((row) => [row.id, row]));
  const pending = await pendingByVersion(session, houseId, versions);

  return rules.map((rule) => {
    const current = rule.current_version_id ? byId.get(rule.current_version_id) : undefined;

    // The newest version of this rule that is still waiting on the Home. There
    // is at most one in practice — a second edit before the first is answered
    // would be a second live question about the same rule — but the newest is
    // taken rather than asserted, because a lapsed decision leaves its version
    // behind and the list must not stall on it.
    const waiting = versions
      .filter((row) => row.rule_id === rule.id && pending.has(row.id))
      .map((row) => ({ row, entry: pending.get(row.id)! }))[0];

    return {
      id: rule.id,
      title: rule.title,
      status: rule.status,
      sortOrder: rule.sort_order,
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
      current: current ? versionView(current) : null,
      pending: waiting
        ? {
            decisionId: waiting.entry.decisionId,
            versionId: waiting.row.id,
            action: waiting.entry.action,
          }
        : null,
    };
  });
}

/**
 * RL-06 and RL-07 — every version, newest first, with what changed and who
 * acknowledged it.
 *
 * The diff is computed against the version *before* it by number rather than
 * against the version in force, so a version the Home refused still reads as
 * what it would have changed.
 */
export async function ruleHistory(
  session: Session,
  houseId: string,
  ruleId: string,
): Promise<{ rule: RuleView; entries: RuleHistoryEntry[] }> {
  const rules = await listRules(session, houseId);
  const rule = rules.find((entry) => entry.id === ruleId);
  if (!rule) throw new ApiError("NOT_FOUND");

  const { data, error } = await session.supabase
    .from("home_rule_versions")
    .select(VERSION_SELECT)
    .eq("house_id", houseId)
    .eq("rule_id", ruleId)
    .order("version_no", { ascending: true });

  if (error) throw apiErrorFromPostgres(error);
  const versions = ((data ?? []) as unknown as VersionRow[]).map(versionView);

  const decisionIds = versions
    .map((version) => version.decisionId)
    .filter((id): id is string => id !== null);

  const responses = await responsesByDecision(session, decisionIds);

  const entries: RuleHistoryEntry[] = versions.map((version, index) => ({
    version,
    changes: diffVersions(
      index === 0 ? null : snapshot(versions[index - 1]),
      snapshot(version),
    ),
    responses: version.decisionId ? (responses.get(version.decisionId) ?? []) : [],
  }));

  entries.reverse();
  return { rule, entries };
}

/**
 * What the parse is told about the Home — docs/10-LLM-SPEC.md section 8.2.
 *
 * Room **labels** rather than room names, and no member names at all. The
 * labels come from the same `OpaqueIds` mapping every other call site uses, so
 * `R2` means the same room here as it does in a schedule payload.
 */
export async function ruleParseContext(
  session: Session,
  houseId: string,
): Promise<RuleParseContext> {
  const [templates, rooms] = await Promise.all([
    session.supabase
      .from("chore_templates")
      .select("name")
      .eq("house_id", houseId)
      .eq("active", true)
      .order("name"),
    session.supabase
      .from("rooms")
      .select("id")
      .eq("house_id", houseId)
      .is("deleted_at", null)
      .order("created_at"),
  ]);

  if (templates.error) throw apiErrorFromPostgres(templates.error);
  if (rooms.error) throw apiErrorFromPostgres(rooms.error);

  const labels = new OpaqueIds("R");
  for (const room of rooms.data ?? []) labels.opaque(room.id);

  return {
    choreTemplates: (templates.data ?? []).map((template) => template.name),
    roles: ["admin", "co_admin", "member"],
    rooms: (rooms.data ?? []).map((room) => labels.opaque(room.id)),
  };
}

// ---------------------------------------------------------------------------
// Writing — which is always proposing
// ---------------------------------------------------------------------------

export interface RuleProposalResult {
  ruleId: string;
  versionId: string;
  versionNo: number;
  status: RuleStatus;
  decision: DecisionView;
  /** True when the Home had nobody to ask and the rule went live on the spot. */
  applied: boolean;
}

/**
 * RL-01 and RL-04 — write a rule, and ask the Home.
 *
 * The compensating delete is the same piece of bookkeeping absence does, for
 * the same reason: the version row has to exist before the decision can point
 * at it, so there is a window in which one exists and the other does not. A
 * refused proposal would otherwise leave a rule nobody can see the point of and
 * a title nobody else can reuse.
 */
export async function createRule(
  session: Session,
  houseId: string,
  memberId: string,
  input: CreateRuleInput,
): Promise<RuleProposalResult> {
  const { data: ruleRow, error } = await session.supabase
    .from("home_rules")
    .insert({
      house_id: houseId,
      title: input.title,
      status: "draft",
      created_by: memberId,
    })
    .select("id, title, status, sort_order, created_at, updated_at, current_version_id")
    .single();

  if (error) throw ruleError(error);
  const rule = ruleRow as unknown as RuleRow;

  try {
    return await addVersionAndPropose(session, houseId, memberId, rule, input, "create", 1);
  } catch (failure) {
    await session.supabase
      .from("home_rules")
      .delete()
      .eq("id", rule.id)
      .eq("status", "draft");
    throw failure;
  }
}

/**
 * RL-05 and RL-06 — edit one rule, individually, without touching any other.
 *
 * Nothing about the rule changes here. A version row is appended and the Home
 * is asked; the version already in force stays in force until the decision
 * applies, which is what makes "changes nothing until it applies" a property of
 * the schema rather than a promise in a route handler.
 */
export async function editRule(
  session: Session,
  houseId: string,
  ruleId: string,
  memberId: string,
  input: UpdateRuleInput,
): Promise<RuleProposalResult> {
  const rule = await loadRule(session, houseId, ruleId);
  const nextNo = await nextVersionNo(session, ruleId);

  return addVersionAndPropose(session, houseId, memberId, rule, input, "edit", nextNo);
}

/**
 * Disabling, which is a version transition and not a delete.
 *
 * The new version is a copy of the one in force with an end date on it, so a
 * rule that was in force in June is still readable in December with its June
 * values — and turning it back on later is the same operation with the end date
 * removed, rather than a second rule with the same words.
 */
export async function setRuleEnabled(
  session: Session,
  houseId: string,
  ruleId: string,
  memberId: string,
  enabled: boolean,
  input: DisableRuleInput,
  today: string,
): Promise<RuleProposalResult> {
  const rule = await loadRule(session, houseId, ruleId);
  if (!rule.current_version_id) throw new ApiError("RULE_NOT_ACTIVE");

  const { data, error } = await session.supabase
    .from("home_rule_versions")
    .select(VERSION_SELECT)
    .eq("id", rule.current_version_id)
    .single();
  if (error) throw apiErrorFromPostgres(error);

  const current = versionView(data as unknown as VersionRow);
  const nextNo = await nextVersionNo(session, ruleId);

  return addVersionAndPropose(
    session,
    houseId,
    memberId,
    rule,
    {
      title: current.title,
      original_text: current.originalText,
      condition: current.condition as never,
      action: current.action as never,
      applies_to: current.appliesTo as never,
      weight_points: current.weightPoints,
      penalty_paise: current.penaltyPaise,
      starts_on: current.startsOn,
      ends_on: enabled ? null : today,
      parsed_by: current.parsedBy,
      reason: input.reason,
      change_reason: enabled ? "Put back in force" : "Disabled",
    },
    enabled ? "enable" : "disable",
    nextNo,
  );
}

// ---------------------------------------------------------------------------
// The shared half
// ---------------------------------------------------------------------------

type VersionInput = CreateRuleInput & { change_reason?: string };

async function addVersionAndPropose(
  session: Session,
  houseId: string,
  memberId: string,
  rule: RuleRow,
  input: VersionInput,
  action: RuleChangeAction,
  versionNo: number,
): Promise<RuleProposalResult> {
  const { data: versionRow, error } = await session.supabase
    .from("home_rule_versions")
    .insert({
      house_id: houseId,
      rule_id: rule.id,
      version_no: versionNo,
      original_text: input.original_text,
      parsed_by: input.parsed_by ?? "manual",
      title: input.title,
      condition: input.condition,
      action: input.action,
      applies_to: input.applies_to,
      weight_points: input.weight_points ?? null,
      penalty_paise: input.penalty_paise ?? null,
      starts_on: input.starts_on ?? null,
      ends_on: input.ends_on ?? null,
      change_reason: input.change_reason ?? null,
      created_by: memberId,
    })
    .select("id, version_no")
    .single();

  if (error) throw ruleError(error);
  const version = versionRow as { id: string; version_no: number };

  let proposal;
  try {
    proposal = await proposeDecision(session, houseId, memberId, {
      type: "change_rule",
      subject_type: "home_rule_version",
      subject_id: version.id,
      payload: {
        action,
        rule_id: rule.id,
        version_no: version.version_no,
        title: input.title,
        weight_points: input.weight_points ?? null,
        penalty_paise: input.penalty_paise ?? null,
      },
      reason: input.reason,
    });
  } catch (failure) {
    // The pending version is removed rather than left orphaned: it is not
    // something the Home refused, it is a question that never got asked.
    await session.supabase
      .from("home_rule_versions")
      .delete()
      .eq("id", version.id)
      .is("activated_at", null);
    throw failure;
  }

  // `proposed` is only ever reached by a rule that has never activated. A rule
  // already in force keeps saying `active` while an edit is being answered —
  // the chip on the row comes from the open decision, and the version
  // underneath is genuinely still the one the Home is bound by (S-40).
  if (!rule.current_version_id && rule.status === "draft" && !proposal.applied) {
    await session.supabase
      .from("home_rules")
      .update({ status: "proposed" })
      .eq("id", rule.id)
      .eq("status", "draft");
  }

  const after = await loadRule(session, houseId, rule.id);

  return {
    ruleId: rule.id,
    versionId: version.id,
    versionNo: version.version_no,
    status: after.status,
    decision: proposal.decision,
    applied: proposal.applied,
  };
}

async function loadRule(
  session: Session,
  houseId: string,
  ruleId: string,
): Promise<RuleRow> {
  const { data, error } = await session.supabase
    .from("home_rules")
    .select("id, title, status, sort_order, created_at, updated_at, current_version_id")
    .eq("id", ruleId)
    .eq("house_id", houseId)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");
  return data as unknown as RuleRow;
}

/**
 * The next version number, read under the rule's own row lock.
 *
 * Through the database function rather than `max(version_no) + 1` here, because
 * two leads drafting an edit in the same second would otherwise both compute 3
 * and one of them would lose to the unique constraint at random.
 */
async function nextVersionNo(session: Session, ruleId: string): Promise<number> {
  const { data, error } = await session.supabase.rpc("next_rule_version_no", {
    p_rule_id: ruleId,
  });
  if (error) throw apiErrorFromPostgres(error);
  return data as unknown as number;
}

async function pendingByVersion(
  session: Session,
  houseId: string,
  versions: VersionRow[],
): Promise<Map<string, { decisionId: string; action: RuleChangeAction }>> {
  const open = versions.filter((row) => row.activated_at === null);
  const pending = new Map<string, { decisionId: string; action: RuleChangeAction }>();
  if (open.length === 0) return pending;

  // One extra read rather than a join: `decisions.subject_id` is polymorphic,
  // so there is no foreign key for PostgREST to embed across.
  const { data, error } = await session.supabase
    .from("decisions")
    .select("id, subject_id, payload")
    .eq("house_id", houseId)
    .eq("type", "change_rule")
    .eq("status", "waiting")
    .in(
      "subject_id",
      open.map((row) => row.id),
    );

  if (error) throw apiErrorFromPostgres(error);

  for (const decision of data ?? []) {
    if (!decision.subject_id) continue;
    const payload = (decision.payload ?? {}) as { action?: string };
    pending.set(decision.subject_id, {
      decisionId: decision.id,
      action: (payload.action as RuleChangeAction) ?? "edit",
    });
  }

  return pending;
}

/** RL-07's last clause: who acknowledged it, and when. */
async function responsesByDecision(
  session: Session,
  decisionIds: string[],
): Promise<Map<string, RuleHistoryEntry["responses"]>> {
  const byDecision = new Map<string, RuleHistoryEntry["responses"]>();
  if (decisionIds.length === 0) return byDecision;

  const { data, error } = await session.supabase
    .from("decision_responses")
    .select("decision_id, member_id, response, responded_at, house_members ( users ( display_name ) )")
    .in("decision_id", decisionIds)
    .order("responded_at");

  if (error) throw apiErrorFromPostgres(error);

  type Row = {
    decision_id: string;
    member_id: string;
    response: string;
    responded_at: string;
    house_members: { users: { display_name: string } | null } | null;
  };

  for (const row of (data ?? []) as unknown as Row[]) {
    const list = byDecision.get(row.decision_id) ?? [];
    list.push({
      memberId: row.member_id,
      memberName: row.house_members?.users?.display_name ?? "Someone",
      response: row.response,
      at: row.responded_at,
    });
    byDecision.set(row.decision_id, list);
  }

  return byDecision;
}

function ruleError(error: { message?: string | null; code?: string | null }) {
  const message = error.message ?? "";
  if (error.code === "23505" && message.includes("home_rules_title_unique")) {
    return new ApiError("RULE_TITLE_TAKEN");
  }
  if (message.includes("weight_in_range")) return new ApiError("RULE_WEIGHT_RANGE");
  if (message.includes("penalty_in_range")) return new ApiError("RULE_PENALTY_RANGE");
  return apiErrorFromPostgres(error);
}
