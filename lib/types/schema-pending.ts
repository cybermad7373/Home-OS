/**
 * The schema delta that `npm run gen:types` has not seen yet.
 *
 * `lib/types/supabase.ts` is generated from a migrated database. Migrations
 * 047-050 are written and, at the time of writing, applied to no environment,
 * so regenerating is not possible and hand-editing the generated file is
 * forbidden — it is overwritten wholesale, and a regeneration that silently
 * deleted hand-written aliases is exactly how D-26 came to be recorded.
 *
 * This file is the hand-written overlay instead. `lib/types/database.ts`
 * merges it into `Database`, so every Supabase client in the app is typed
 * against the schema the migrations describe rather than the one the generated
 * file remembers.
 *
 * **When `npm run gen:types` next runs against a database carrying 047-050,
 * delete the entries below that the generated file now covers.** Anything left
 * here after that is either a mistake or a migration that has not been pushed.
 */

import type { Database as Generated } from "./supabase";

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

export type PendingTables = Omit<GeneratedTables, "houses" | "house_members"> & {
  houses: HousesTable;
  house_members: HouseMembersTable;
  invitations: InvitationsTable;
  join_requests: JoinRequestsTable;
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

type MemberReturn = HouseMembersTable["Row"];

export type PendingFunctions = Omit<
  GeneratedFunctions,
  "create_house" | "add_dependent" | "current_member" | "join_house" | "regenerate_invite_code"
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
  remove_member: {
    Args: { p_member_id: string };
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
  accept_join_request: {
    Args: { p_request_id: string };
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
};
