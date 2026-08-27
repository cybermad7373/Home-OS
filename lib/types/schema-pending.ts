/**
 * The schema delta that `npm run gen:types` has not seen yet.
 *
 * `lib/types/supabase.ts` is generated from a migrated database. Migrations
 * 047-054 are written and, at the time of writing, applied to no environment,
 * so regenerating is not possible and hand-editing the generated file is
 * forbidden — it is overwritten wholesale, and a regeneration that silently
 * deleted hand-written aliases is exactly how D-26 came to be recorded.
 *
 * This file is the hand-written overlay instead. `lib/types/database.ts`
 * merges it into `Database`, so every Supabase client in the app is typed
 * against the schema the migrations describe rather than the one the generated
 * file remembers.
 *
 * **When `npm run gen:types` next runs against a database carrying 047-055,
 * delete the entries below that the generated file now covers.** Anything left
 * here after that is either a mistake or a migration that has not been pushed.
 */

import type { Database as Generated, Json } from "./supabase";

type Public = Generated["public"];
type GeneratedTables = Public["Tables"];
type GeneratedFunctions = Public["Functions"];

// ---------------------------------------------------------------------------
// Enums changed by migration 047 and renamed by 049
// ---------------------------------------------------------------------------

export type PendingEnums = Omit<
  Public["Enums"],
  "member_role" | "member_status" | "household_type"
> & {
  member_role: "admin" | "co_admin" | "member";
  member_status: "requested" | "active" | "inactive";
  /** `household_type`, renamed in 049. Same two values. */
  home_type: "shared" | "family";

  /** 051 — the governance vocabulary, mirroring lib/domain/governance/types.ts. */
  decision_type:
    | "close_settlement"
    | "reopen_settlement"
    | "remove_member"
    | "change_rule"
    | "change_governance"
    | "change_home_mode"
    | "balance_adjustment"
    | "absence_request"
    | "join_request"
    | "expense_approval"
    | "chore_confirmation"
    | "set_expected_contribution"
    | "create_reserve"
    | "reserve_draw";
  decision_level: "normal" | "important" | "critical";
  decision_status:
    | "waiting"
    | "approved"
    | "rejected"
    | "lapsed"
    | "cancelled"
    | "applied";
  response_capacity: "approver" | "acknowledger";
  response_kind: "approve" | "reject" | "acknowledge";

  /** 054 — CE-10. Mirrors `ConfirmationPolicy` in the governance domain. */
  confirmation_policy: "size_aware" | "single" | "off";
};

type MemberRole = PendingEnums["member_role"];
type MemberStatus = PendingEnums["member_status"];
type HomeType = PendingEnums["home_type"];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** 049: `household_type` becomes `home_type`; the four location columns. */
type HousesTable = {
  Row: Omit<GeneratedTables["houses"]["Row"], "household_type"> & {
    home_type: HomeType;
    country_code: string | null;
    state: string | null;
    city: string | null;
    area: string | null;
  };
  Insert: Omit<GeneratedTables["houses"]["Insert"], "household_type"> & {
    home_type?: HomeType;
    country_code?: string | null;
    state?: string | null;
    city?: string | null;
    area?: string | null;
  };
  Update: Omit<GeneratedTables["houses"]["Update"], "household_type"> & {
    home_type?: HomeType;
    country_code?: string | null;
    state?: string | null;
    city?: string | null;
    area?: string | null;
  };
  Relationships: GeneratedTables["houses"]["Relationships"];
};

/** 048: role is nullable while Requested. 050: the two removal columns. */
type HouseMembersTable = {
  Row: Omit<GeneratedTables["house_members"]["Row"], "role" | "status"> & {
    role: MemberRole | null;
    status: MemberStatus;
    removal_decision_id: string | null;
    pending_settlement: boolean;
  };
  Insert: Omit<GeneratedTables["house_members"]["Insert"], "role" | "status"> & {
    role?: MemberRole | null;
    status?: MemberStatus;
    removal_decision_id?: string | null;
    pending_settlement?: boolean;
  };
  Update: Omit<GeneratedTables["house_members"]["Update"], "role" | "status"> & {
    role?: MemberRole | null;
    status?: MemberStatus;
    removal_decision_id?: string | null;
    pending_settlement?: boolean;
  };
  Relationships: GeneratedTables["house_members"]["Relationships"];
};

/** 049 — one live invite link per Home. */
type InvitationsTable = {
  Row: {
    id: string;
    house_id: string;
    token: string;
    created_by: string;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    house_id: string;
    token: string;
    created_by: string;
    expires_at?: string | null;
    revoked_at?: string | null;
    created_at?: string;
  };
  Update: {
    expires_at?: string | null;
    revoked_at?: string | null;
  };
  Relationships: [];
};

export type JoinRequestStatus = "requested" | "accepted" | "declined" | "withdrawn";

/** 049 — the only path to membership (HM-06). */
type JoinRequestsTable = {
  Row: {
    id: string;
    house_id: string;
    user_id: string;
    invitation_id: string | null;
    message: string | null;
    status: JoinRequestStatus;
    decided_by: string | null;
    decided_at: string | null;
    decline_reason: string | null;
    member_id: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    house_id: string;
    user_id: string;
    invitation_id?: string | null;
    message?: string | null;
    status?: JoinRequestStatus;
  };
  Update: {
    status?: JoinRequestStatus;
    decided_by?: string | null;
    decided_at?: string | null;
    decline_reason?: string | null;
    member_id?: string | null;
  };
  Relationships: [];
};


type DecisionType = PendingEnums["decision_type"];
type DecisionLevel = PendingEnums["decision_level"];
type DecisionStatus = PendingEnums["decision_status"];
type ResponseCapacity = PendingEnums["response_capacity"];
type ResponseKind = PendingEnums["response_kind"];

/** 051 — one row per Home, seeded by a trigger, written only by a decision. */
type GovernancePolicyTable = {
  Row: {
    house_id: string;
    critical_requires_coadmin: boolean;
    critical_member_rule: "count" | "proportion";
    critical_member_value: number;
    governance_requires_all: boolean;
    absence_approver_roles: MemberRole[];
    join_approver_roles: MemberRole[];
    expense_approvals_required: number;
    decision_deadline_days: number;
    absence_deadline_hours: number;
    created_at: string;
    updated_at: string;
  };
  /** No insert or update policy exists; the shapes are here for the effect. */
  Insert: { house_id: string };
  Update: {
    critical_requires_coadmin?: boolean;
    critical_member_rule?: "count" | "proportion";
    critical_member_value?: number;
    governance_requires_all?: boolean;
    absence_approver_roles?: MemberRole[];
    join_approver_roles?: MemberRole[];
    expense_approvals_required?: number;
    decision_deadline_days?: number;
    absence_deadline_hours?: number;
  };
  Relationships: [];
};

/** 051 — the record. Written by `create_decision` and by nothing else. */
type DecisionsTable = {
  Row: {
    id: string;
    house_id: string;
    type: DecisionType;
    level: DecisionLevel;
    requested_by: string;
    subject_type: string | null;
    subject_id: string | null;
    subject_member_id: string | null;
    payload: Json;
    reason: string | null;
    required_approvals: number;
    required_acks: number;
    deadline: string | null;
    status: DecisionStatus;
    result: Json | null;
    auto_approved: boolean;
    supersedes_id: string | null;
    created_at: string;
    resolved_at: string | null;
    applied_at: string | null;
  };
  Insert: never;
  Update: never;
  Relationships: [];
};

type DecisionParticipantsTable = {
  Row: {
    id: string;
    decision_id: string;
    member_id: string;
    capacity: ResponseCapacity;
    is_mandatory: boolean;
    created_at: string;
  };
  Insert: never;
  Update: never;
  Relationships: [];
};

/**
 * 051 — the one table a browser writes to in this whole subsystem, and only
 * through the `respond_to_own_decision` insert policy. There is no update and
 * no delete policy: a response is a statement of record, not a draft.
 */
type DecisionResponsesTable = {
  Row: {
    id: string;
    decision_id: string;
    member_id: string;
    capacity: ResponseCapacity;
    response: ResponseKind;
    reason: string | null;
    responded_at: string;
  };
  Insert: {
    decision_id: string;
    member_id: string;
    capacity: ResponseCapacity;
    response: ResponseKind;
    reason?: string | null;
  };
  Update: never;
  Relationships: [];
};

type ConfirmationPolicyName = PendingEnums["confirmation_policy"];

/** 054 — the Home may reduce the chore quorum or switch it off (CE-10). */
type HouseSettingsTable = {
  Row: GeneratedTables["house_settings"]["Row"] & {
    confirmation_policy: ConfirmationPolicyName;
  };
  Insert: GeneratedTables["house_settings"]["Insert"] & {
    confirmation_policy?: ConfirmationPolicyName;
  };
  Update: GeneratedTables["house_settings"]["Update"] & {
    confirmation_policy?: ConfirmationPolicyName;
  };
  Relationships: GeneratedTables["house_settings"]["Relationships"];
};

/**
 * 054 — the quorum snapshot. `confirmations_required` and
 * `requires_lead_confirmer` are written once, by `mark_chore_done`, and
 * never recomputed: a Home that changes size between "done" and "confirmed"
 * does not move the goalposts.
 */
type ChoreAssignmentsTable = {
  Row: GeneratedTables["chore_assignments"]["Row"] & {
    confirmations_required: number;
    confirmations_received: number;
    requires_lead_confirmer: boolean;
  };
  Insert: GeneratedTables["chore_assignments"]["Insert"] & {
    confirmations_required?: number;
    confirmations_received?: number;
    requires_lead_confirmer?: boolean;
  };
  Update: GeneratedTables["chore_assignments"]["Update"] & {
    confirmations_required?: number;
    confirmations_received?: number;
    requires_lead_confirmer?: boolean;
  };
  Relationships: GeneratedTables["chore_assignments"]["Relationships"];
};

/**
 * 054 — one row per person per assignment, readable by the Home and written
 * only by `confirm_chore`. `is_lead` is snapshotted at signing time.
 */
type ChoreConfirmationsTable = {
  Row: {
    id: string;
    house_id: string;
    assignment_id: string;
    member_id: string;
    is_lead: boolean;
    created_at: string;
  };
  Insert: never;
  Update: never;
  Relationships: [];
};

/**
 * 055 — a notification is addressed to a member or to a user, never both and
 * never neither. `user_id` exists for N-40, which tells somebody their request
 * to join was declined: they have no membership in that Home, which is the
 * whole content of the message.
 */
type NotificationsTable = {
  Row: Omit<GeneratedTables["notifications"]["Row"], "member_id"> & {
    member_id: string | null;
    user_id: string | null;
  };
  Insert: Omit<GeneratedTables["notifications"]["Insert"], "member_id"> & {
    member_id?: string | null;
    user_id?: string | null;
  };
  Update: Omit<GeneratedTables["notifications"]["Update"], "member_id"> & {
    member_id?: string | null;
    user_id?: string | null;
  };
  Relationships: [];
};

/** 055 — the three preference switches section 6 of the spec adds in 2.0. */
type NotificationPrefsTable = {
  Row: GeneratedTables["notification_prefs"]["Row"] & {
    decisions: boolean;
    decision_outcomes: boolean;
    membership: boolean;
  };
  Insert: GeneratedTables["notification_prefs"]["Insert"] & {
    decisions?: boolean;
    decision_outcomes?: boolean;
    membership?: boolean;
  };
  Update: GeneratedTables["notification_prefs"]["Update"] & {
    decisions?: boolean;
    decision_outcomes?: boolean;
    membership?: boolean;
  };
  Relationships: [];
};

export type PendingTables = Omit<
  GeneratedTables,
  | "houses"
  | "house_members"
  | "house_settings"
  | "chore_assignments"
  | "notifications"
  | "notification_prefs"
> & {
  houses: HousesTable;
  house_members: HouseMembersTable;
  house_settings: HouseSettingsTable;
  chore_assignments: ChoreAssignmentsTable;
  chore_confirmations: ChoreConfirmationsTable;
  invitations: InvitationsTable;
  join_requests: JoinRequestsTable;
  governance_policy: GovernancePolicyTable;
  decisions: DecisionsTable;
  decision_participants: DecisionParticipantsTable;
  decision_responses: DecisionResponsesTable;
  notifications: NotificationsTable;
  notification_prefs: NotificationPrefsTable;
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

type MemberReturn = HouseMembersTable["Row"];

export type PendingFunctions = Omit<
  GeneratedFunctions,
  | "create_house"
  | "add_dependent"
  | "current_member"
  | "join_house"
  | "regenerate_invite_code"
  | "set_notification_prefs"
> & {
  create_house: {
    Args: {
      p_name: string;
      p_address?: string;
      p_timezone?: string;
      p_currency?: string;
      p_type?: HomeType;
      p_country_code?: string;
      p_state?: string;
      p_city?: string;
      p_area?: string;
    };
    Returns: { house_id: string; invite_code: string; invite_token: string }[];
  };
  add_dependent: {
    Args: {
      p_house_id: string;
      p_name: string;
      p_guardian_id?: string;
      p_shares_cost?: boolean;
      p_does_chores?: boolean;
      p_residency?: Public["Enums"]["residency_type"];
    };
    Returns: MemberReturn;
  };
  current_member: {
    Args: { p_house_id?: string };
    Returns: MemberReturn;
  };
  is_house_lead: {
    Args: { p_house_id: string };
    Returns: boolean;
  };
  lookup_invitation: {
    Args: { p_token: string };
    Returns: { house_name: string; home_type: HomeType; member_count: number }[];
  };
  request_join: {
    Args: { p_token: string; p_message?: string };
    Returns: { house_id: string; house_name: string; status: JoinRequestStatus }[];
  };
  rotate_invitation: {
    Args: { p_house_id: string };
    Returns: InvitationsTable["Row"];
  };
  /** 053 restated this: a decision effect supplies the decider it cannot read. */
  accept_join_request: {
    Args: { p_request_id: string; p_decided_by?: string };
    Returns: MemberReturn;
  };
  decline_join_request: {
    Args: { p_request_id: string; p_reason: string };
    Returns: JoinRequestsTable["Row"];
  };
  withdraw_join_request: {
    Args: { p_request_id: string };
    Returns: JoinRequestsTable["Row"];
  };

  // --- 051-053: governance -------------------------------------------------
  create_decision: {
    Args: {
      p_house_id: string;
      p_type: DecisionType;
      p_level: DecisionLevel;
      p_participants: Json;
      p_required_approvals?: number;
      p_required_acks?: number;
      p_subject_type?: string | null;
      p_subject_id?: string | null;
      p_subject_member_id?: string | null;
      p_payload?: Json;
      p_reason?: string | null;
      p_deadline?: string | null;
      p_supersedes_id?: string | null;
    };
    Returns: DecisionsTable["Row"];
  };
  cancel_decision: {
    Args: { p_decision_id: string };
    Returns: DecisionsTable["Row"];
  };
  resolve_decision: {
    Args: { p_decision_id: string };
    Returns: DecisionStatus;
  };
  /** Service role only — a browser responds, the server applies. */
  apply_decision: {
    Args: { p_decision_id: string; p_input?: Json };
    Returns: DecisionsTable["Row"];
  };
  expire_decisions: {
    Args: Record<string, never>;
    Returns: number;
  };

  // --- 055: governance notifications and their jobs ------------------------
  /** Two more switches than the generated signature knows about. */
  set_notification_prefs: {
    Args: {
      p_chore_reminders?: boolean;
      p_confirmation_requests?: boolean;
      p_chore_outcomes?: boolean;
      p_house_activity?: boolean;
      p_expense_activity?: boolean;
      p_weekly_digest?: boolean;
      p_quiet_hours_start?: string;
      p_quiet_hours_end?: string;
      p_quiet_hours_off?: boolean;
      p_telegram_enabled?: boolean;
      p_decision_outcomes?: boolean;
      p_membership?: boolean;
    };
    Returns: NotificationPrefsTable["Row"];
  };
  /** Service role only. Called when an approved decision's effect refuses. */
  notify_apply_refused: {
    Args: { p_decision_id: string; p_reason: string };
    Returns: string | null;
  };
  remind_decision_participants: {
    Args: Record<string, never>;
    Returns: number;
  };

  // --- 054: the chore confirmation quorum ----------------------------------
  /** The PL/pgSQL restatement of `quorumFor`. Read, never stored, by callers. */
  chore_quorum_for: {
    Args: { p_house_id: string; p_assignee_member_id: string };
    Returns: { required: number; lead_required: boolean; auto_confirm: boolean }[];
  };
};
