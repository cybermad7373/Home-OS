import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/infra/supabase/server";
import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import type { Database } from "@/lib/types/database";
import type {
  HouseContext,
  HouseMemberRow,
  HouseRow,
  HouseSettingsRow,
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
 * A user may belong to several houses (the glossary says so), but version 1
 * shows one at a time: the most recently joined membership that is not
 * inactive. Pending memberships are returned too, because the waiting screen
 * needs the house name.
 */
export async function getMembership(session: Session): Promise<Membership | null> {
  const { data, error } = await session.supabase
    .from("house_members")
    .select("*, houses(*)")
    .eq("user_id", session.userId)
    .neq("status", "inactive")
    .order("status", { ascending: true }) // 'active' sorts before 'pending'
    .order("joined_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) return null;

  const { houses, ...member } = data as HouseMemberRow & { houses: HouseRow };
  return { member: member as HouseMemberRow, house: houses };
}

export async function requireActiveMembership(session: Session): Promise<Membership> {
  const membership = await getMembership(session);
  if (!membership) throw new ApiError("NOT_HOUSE_MEMBER");
  if (membership.member.status === "pending") throw new ApiError("MEMBERSHIP_PENDING");
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

export async function getSettings(
  session: Session,
  houseId: string,
): Promise<HouseSettingsRow> {
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
    shape: houseShapeOf(house, settings),
  };
}
