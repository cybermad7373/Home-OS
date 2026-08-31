import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/infra/supabase/server";
import { readSelectedHouseId } from "@/lib/infra/supabase/selected-house";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import type { Database, UserRow } from "@/lib/types/database";
import type {
  HouseContext,
  HouseMemberRow,
  HouseRow,
  HouseSettingsRow,
  HouseSettingsRowExtended,
  MemberView,
  RoomView,
} from "@/lib/types/domain";
import { houseShapeOf } from "@/lib/types/domain";

/**
 * The house repository. SQL lives here and in the migrations, nowhere else
 * (docs/03-ARCHITECTURE.md section 6).
 */

export type Client = SupabaseClient<Database>;

export interface Session {
  supabase: Client;
  userId: string;
}

/** The caller's membership, whatever its status — including none at all. */
export interface Membership {
  member: HouseMemberRow;
  house: HouseRow;
}

export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase: supabase as Client, userId: user.id };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError("UNAUTHENTICATED");
  return session;
}

/**
 * Every Home the caller has any membership in, Requested ones included,
 * ordered the way `getMembership` wants them: Active before Requested, and
 * within each, most recently joined first.
 *
 * `inactive` is excluded. A person who has left a Home does not get shown that
 * Home; their rows stay for the ledger's sake, not for theirs.
 */
export async function listMemberships(session: Session): Promise<Membership[]> {
  const { data, error } = await session.supabase
    .from("house_members")
    .select("*, houses(*)")
    .eq("user_id", session.userId)
    .neq("status", "inactive")
    .order("status", { ascending: true }) // 'active' sorts before 'requested'
    .order("joined_date", { ascending: false });

  if (error) throw apiErrorFromPostgres(error);

  return (data ?? []).map((row) => {
    const { houses, ...member } = row as HouseMemberRow & { houses: HouseRow };
    return { member: member as HouseMemberRow, house: houses };
  });
}

/**
 * The caller's Home for this request.
 *
 * A person belongs to several Homes from phase 10 onward, and exactly one of
 * them is selected at a time. The selection is a cookie hint; it is resolved
 * here against the memberships the caller actually has, so a cookie naming a
 * Home they were removed from — or never belonged to — falls back to their
 * default rather than failing, and never reaches that Home's data.
 *
 * This is the single accessor from IMPLEMENTATION-PLAN-2.0 section 2.3. Every
 * route handler and server component in the app reaches its Home through this
 * function, which is why introducing Homes needed no edit to the 67 handlers
 * that shipped before Homes existed.
 */
export async function getMembership(session: Session): Promise<Membership | null> {
  const memberships = await listMemberships(session);
  if (memberships.length === 0) return null;

  const selectedId = await readSelectedHouseId();
  const selected = selectedId
    ? memberships.find((candidate) => candidate.house.id === selectedId)
    : undefined;

  return selected ?? memberships[0];
}

export async function requireActiveMembership(session: Session): Promise<Membership> {
  const membership = await getMembership(session);
  if (!membership) throw new ApiError("NOT_HOUSE_MEMBER");
  if (membership.member.status !== "active") {
    throw new ApiError("MEMBERSHIP_NOT_ACTIVE");
  }
  return membership;
}

/** Admin or Co-Admin — the operational tier, `is_house_lead()` in the database. */
export async function requireLeadMembership(session: Session): Promise<Membership> {
  const membership = await requireActiveMembership(session);
  if (membership.member.role !== "admin" && membership.member.role !== "co_admin") {
    throw new ApiError("LEAD_REQUIRED");
  }
  return membership;
}

export async function requireAdminMembership(session: Session): Promise<Membership> {
  const membership = await requireActiveMembership(session);
  if (membership.member.role !== "admin") throw new ApiError("ADMIN_REQUIRED");
  return membership;
}

/**
 * `v_current_occupancy` is a join, so Postgres reports every one of its columns
 * as nullable even though a row cannot exist without a member and a room. Rather
 * than assert that away at four call sites, drop the impossible rows once.
 */
export interface OccupancyRow {
  member_id: string | null;
  room_id: string | null;
}

export function roomByMemberFrom(rows: OccupancyRow[] | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    if (row.member_id && row.room_id) map.set(row.member_id, row.room_id);
  }
  return map;
}

type MemberJoinRow = HouseMemberRow & {
  users: {
    display_name: string;
    username: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
};

function toMemberView(
  row: MemberJoinRow,
  roomByMemberId: Map<string, { id: string; name: string }>,
): MemberView {
  return {
    id: row.id,
    userId: row.user_id,
    // A dependent has no users row, and carries their name on the membership.
    displayName: row.users?.display_name ?? row.display_name ?? "Unknown",
    username: row.users?.username ?? null,
    email: row.users?.email ?? "",
    avatarUrl: row.users?.avatar_url ?? null,
    role: row.role,
    status: row.status,
    residency: row.residency,
    canCook: row.can_cook,
    joinedDate: row.joined_date,
    leftDate: row.left_date,
    room: roomByMemberId.get(row.id) ?? null,
    kind: row.member_kind,
    sharesCost: row.shares_cost,
    doesChores: row.does_chores,
    guardianMemberId: row.guardian_member_id,
    pendingSettlement: row.pending_settlement,
  };
}

/** Every member of the house, pending ones included, with their current room. */
export async function listMembers(
  session: Session,
  houseId: string,
): Promise<MemberView[]> {
  const [membersResult, occupancyResult] = await Promise.all([
    session.supabase
      .from("house_members")
      .select("*, users(display_name, username, email, avatar_url)")
      .eq("house_id", houseId)
      .order("status", { ascending: true })
      .order("joined_date", { ascending: true }),
    session.supabase
      .from("v_current_occupancy")
      .select("member_id, room_id, room_name")
      .eq("house_id", houseId),
  ]);

  if (membersResult.error) throw apiErrorFromPostgres(membersResult.error);
  if (occupancyResult.error) throw apiErrorFromPostgres(occupancyResult.error);

  const roomByMemberId = new Map<string, { id: string; name: string }>();
  for (const row of occupancyResult.data ?? []) {
    if (!row.member_id || !row.room_id) continue;
    roomByMemberId.set(row.member_id, {
      id: row.room_id,
      name: row.room_name ?? "",
    });
  }

  return (membersResult.data as MemberJoinRow[]).map((row) =>
    toMemberView(row, roomByMemberId),
  );
}

export async function listRooms(session: Session, houseId: string): Promise<RoomView[]> {
  const [roomsResult, occupancyResult] = await Promise.all([
    session.supabase
      .from("rooms")
      .select("*")
      .eq("house_id", houseId)
      .is("deleted_at", null)
      .order("name"),
    session.supabase
      .from("v_current_occupancy")
      .select("room_id, member_id, display_name")
      .eq("house_id", houseId),
  ]);

  if (roomsResult.error) throw apiErrorFromPostgres(roomsResult.error);
  if (occupancyResult.error) throw apiErrorFromPostgres(occupancyResult.error);

  const occupantsByRoom = new Map<string, RoomView["occupants"]>();
  for (const row of occupancyResult.data ?? []) {
    if (!row.room_id || !row.member_id) continue;
    const list = occupantsByRoom.get(row.room_id) ?? [];
    list.push({
      memberId: row.member_id,
      displayName: row.display_name ?? "Unknown",
      avatarUrl: null,
    });
    occupantsByRoom.set(row.room_id, list);
  }

  return (roomsResult.data ?? []).map((room) => ({
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    monthlyRentPaise: room.monthly_rent_paise,
    occupants: occupantsByRoom.get(room.id) ?? [],
  }));
}

/**
 * The caller's own account row.
 *
 * Onboarding needs it before there is a Home to read a member through: a
 * Google sign-in arrives with no username, and every screen after this one
 * identifies people by one. `null` when the row has not been created yet.
 *
 * Only ever the caller's own row. Looking anybody up by email stays on the
 * server and out of this accessor entirely (AGENTS.md, "Non-negotiable domain
 * and data rules").
 */
export async function getOwnProfile(
  session: Session,
): Promise<Pick<UserRow, "username" | "email" | "display_name" | "upi_vpa"> | null> {
  const { data, error } = await session.supabase
    .from("users")
    .select("username, email, display_name, upi_vpa")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  return data ?? null;
}

export async function getSettings(
  session: Session,
  houseId: string,
): Promise<HouseSettingsRowExtended> {
  const { data, error } = await session.supabase
    .from("house_settings")
    .select("*")
    .eq("house_id", houseId)
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return data;
}

/** Everything a screen needs about the caller's house, in one round of queries. */
export async function getHouseContext(session: Session): Promise<HouseContext> {
  const { house, member } = await requireActiveMembership(session);
  const [settings, rooms, members] = await Promise.all([
    getSettings(session, house.id),
    listRooms(session, house.id),
    listMembers(session, house.id),
  ]);

  const me = members.find((candidate) => candidate.id === member.id);
  if (!me) throw new ApiError("NOT_HOUSE_MEMBER");

  return {
    house,
    settings,
    rooms,
    members,
    me,
    isAdmin: member.role === "admin",
    isLead: member.role === "admin" || member.role === "co_admin",
    shape: houseShapeOf(house, settings),
  };
}
