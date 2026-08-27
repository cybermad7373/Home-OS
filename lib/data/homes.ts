import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { createClient } from "@/lib/infra/supabase/server";
import { appUrl } from "@/lib/infra/supabase/env";
import { listMemberships, type Session } from "./house";
import type {
  HomeType,
  InvitationRow,
  JoinRequestRow,
  MemberRole,
  MemberStatus,
} from "@/lib/types/database";

/**
 * Homes, invite links and join requests — docs/05-API-SPEC.md section 2.1.
 *
 * The rule this module exists to hold: **there is no path here that creates a
 * membership for somebody else.** `acceptRequest` is the only function that
 * ends in a `house_members` row, and it needs a request the person raised from
 * a link they held. Adding a function that skips that step would be a defect,
 * not a feature (HM-06).
 *
 * Every write goes through a security-definer function. The tables have a read
 * policy and no write policy at all, so a client that reached past this module
 * would be refused by the database rather than by this file.
 */

export interface HomeCard {
  id: string;
  name: string;
  homeType: HomeType;
  role: MemberRole | null;
  status: MemberStatus;
  /** Open join requests. Zero for anyone who is not a lead, and for Requested rows. */
  pendingCount: number;
}

export interface HomesView {
  selectedHouseId: string | null;
  homes: HomeCard[];
}

/**
 * Every Home the caller belongs to, with the counts a lead needs on the card.
 *
 * A Requested row carries `role: null` and nothing else about that Home — not
 * its member list, not its counts, not its settings. That is not politeness in
 * this function; RLS returns the caller zero rows from those tables, so there
 * is nothing here to leak.
 */
export async function listHomes(
  session: Session,
  selectedHouseId: string | null,
): Promise<HomesView> {
  const memberships = await listMemberships(session);

  const leadHouseIds = memberships
    .filter(
      (m) =>
        m.member.status === "active" &&
        (m.member.role === "admin" || m.member.role === "co_admin"),
    )
    .map((m) => m.house.id);

  const pendingByHouse = new Map<string, number>();
  if (leadHouseIds.length > 0) {
    const { data, error } = await session.supabase
      .from("join_requests")
      .select("house_id")
      .in("house_id", leadHouseIds)
      .eq("status", "requested");
    if (error) throw apiErrorFromPostgres(error);
    for (const row of data ?? []) {
      pendingByHouse.set(row.house_id, (pendingByHouse.get(row.house_id) ?? 0) + 1);
    }
  }

  const homes = memberships.map<HomeCard>((m) => ({
    id: m.house.id,
    name: m.house.name,
    homeType: m.house.home_type,
    role: m.member.role,
    status: m.member.status,
    pendingCount: pendingByHouse.get(m.house.id) ?? 0,
  }));

  // The selection is only meaningful if it is still one of the caller's Homes.
  const selected =
    selectedHouseId && homes.some((home) => home.id === selectedHouseId)
      ? selectedHouseId
      : (homes[0]?.id ?? null);

  return { selectedHouseId: selected, homes };
}

/**
 * Refuses a selection the caller is not Active in.
 *
 * The cookie is a hint everywhere else and resolves silently; here it is an
 * instruction, so a Home the caller cannot use is an error rather than a
 * surprise redirect to a different Home.
 */
export async function assertSelectable(
  session: Session,
  houseId: string,
): Promise<void> {
  const memberships = await listMemberships(session);
  const match = memberships.find((m) => m.house.id === houseId);
  if (!match) throw new ApiError("NOT_HOUSE_MEMBER");
  if (match.member.status !== "active") throw new ApiError("MEMBERSHIP_NOT_ACTIVE");
}

// ---------------------------------------------------------------------------
// Invite links
// ---------------------------------------------------------------------------

export function inviteUrl(token: string): string {
  return `${appUrl()}/join/${token}`;
}

/** The Home's live link, or null if it somehow has none. */
export async function getLiveInvitation(
  session: Session,
  houseId: string,
): Promise<InvitationRow | null> {
  const { data, error } = await session.supabase
    .from("invitations")
    .select("*")
    .eq("house_id", houseId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw apiErrorFromPostgres(error);
  return data;
}

/**
 * Rotates the link. The previous one dies in the same statement, and neither an
 * existing membership nor an open request is touched (SEC-15).
 */
export async function rotateInvitation(
  session: Session,
  houseId: string,
): Promise<InvitationRow> {
  const { data, error } = await session.supabase.rpc("rotate_invitation", {
    p_house_id: houseId,
  });
  if (error) throw apiErrorFromPostgres(error);
  const row = (Array.isArray(data) ? data[0] : data) as InvitationRow | null;
  if (!row) throw new ApiError("INTERNAL");
  return row;
}

// ---------------------------------------------------------------------------
// The public landing page
// ---------------------------------------------------------------------------

export interface InvitePreview {
  houseName: string;
  homeType: HomeType;
  memberCount: number;
  valid: boolean;
}

/**
 * What a stranger sees before signing in. Unauthenticated by design.
 *
 * An invalid, expired or revoked token returns the same shape with
 * `valid: false`, so the endpoint never reveals whether the Home exists.
 */
export async function previewInvitation(token: string): Promise<InvitePreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_invitation", { p_token: token });
  if (error) throw apiErrorFromPostgres(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    houseName: row.house_name,
    homeType: row.home_type,
    memberCount: row.member_count,
    valid: true,
  };
}

/** The only path to membership (HM-06). */
export async function requestJoin(
  session: Session,
  token: string,
  message?: string,
): Promise<{ houseId: string; houseName: string; status: string }> {
  const { data, error } = await session.supabase.rpc("request_join", {
    p_token: token,
    p_message: message?.trim() ? message.trim() : undefined,
  });
  if (error) throw apiErrorFromPostgres(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new ApiError("INVALID_INVITE");
  return { houseId: row.house_id, houseName: row.house_name, status: row.status };
}

// ---------------------------------------------------------------------------
// The queue a lead answers
// ---------------------------------------------------------------------------

export interface JoinRequestView {
  id: string;
  displayName: string;
  username: string | null;
  message: string | null;
  requestedAt: string;
}

export async function listJoinRequests(
  session: Session,
  houseId: string,
): Promise<JoinRequestView[]> {
  const { data, error } = await session.supabase
    .from("join_requests")
    .select("id, message, created_at, users(display_name, username)")
    .eq("house_id", houseId)
    .eq("status", "requested")
    .order("created_at", { ascending: true });

  if (error) throw apiErrorFromPostgres(error);

  type Row = {
    id: string;
    message: string | null;
    created_at: string;
    users: { display_name: string; username: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    displayName: row.users?.display_name ?? "Someone",
    username: row.users?.username ?? null,
    message: row.message,
    requestedAt: row.created_at,
  }));
}

/** The count an ordinary member is allowed to see, and nothing behind it (HM-07). */
export async function countOpenJoinRequests(
  session: Session,
  houseId: string,
): Promise<number> {
  const { count, error } = await session.supabase
    .from("join_requests")
    .select("id", { count: "exact", head: true })
    .eq("house_id", houseId)
    .eq("status", "requested");
  if (error) throw apiErrorFromPostgres(error);
  return count ?? 0;
}

export async function acceptJoinRequest(session: Session, requestId: string) {
  const { data, error } = await session.supabase.rpc("accept_join_request", {
    p_request_id: requestId,
  });
  if (error) throw apiErrorFromPostgres(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new ApiError("NOT_FOUND");
  return row;
}

/** Declining requires a reason, and the person may ask again. */
export async function declineJoinRequest(
  session: Session,
  requestId: string,
  reason: string,
): Promise<JoinRequestRow> {
  const { data, error } = await session.supabase.rpc("decline_join_request", {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) throw apiErrorFromPostgres(error);
  const row = (Array.isArray(data) ? data[0] : data) as JoinRequestRow | null;
  if (!row) throw new ApiError("NOT_FOUND");
  return row;
}

export async function withdrawJoinRequest(
  session: Session,
  requestId: string,
): Promise<JoinRequestRow> {
  const { data, error } = await session.supabase.rpc("withdraw_join_request", {
    p_request_id: requestId,
  });
  if (error) throw apiErrorFromPostgres(error);
  const row = (Array.isArray(data) ? data[0] : data) as JoinRequestRow | null;
  if (!row) throw new ApiError("NOT_FOUND");
  return row;
}

/** The caller's own open requests, for the waiting screen. */
export async function listOwnJoinRequests(session: Session) {
  const { data, error } = await session.supabase
    .from("join_requests")
    .select("id, house_id, status, created_at, houses(name, home_type)")
    .eq("user_id", session.userId)
    .eq("status", "requested")
    .order("created_at", { ascending: false });
  if (error) throw apiErrorFromPostgres(error);

  type Row = {
    id: string;
    house_id: string;
    status: string;
    created_at: string;
    houses: { name: string; home_type: HomeType } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    houseId: row.house_id,
    houseName: row.houses?.name ?? "A home",
    homeType: row.houses?.home_type ?? ("shared" as HomeType),
    requestedAt: row.created_at,
  }));
}
