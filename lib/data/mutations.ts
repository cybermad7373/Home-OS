import "server-only";

import { ApiError, apiErrorFromPostgres } from "@/lib/api/errors";
import { rupeesToPaise } from "@/lib/utils/money";
import type { Session } from "./house";
import type {
  EffortMode,
  MemberRole,
  HouseMemberRow,
  HouseSettingsRow,
  HomeType,
  MoneyMode,
  ResidencyType,
  RoomRow,
  UserRow,
} from "@/lib/types/database";

/**
 * Write paths for the house module. Each one is a thin, audited wrapper over a
 * single statement or RPC — the rules they enforce live in the database.
 */

export async function createHouse(
  session: Session,
  input: {
    name: string;
    address?: string;
    timezone: string;
    currency: string;
    homeType: HomeType;
    location?: {
      countryCode?: string;
      state?: string;
      city?: string;
      area?: string;
    };
  },
): Promise<{ houseId: string; inviteCode: string; inviteToken: string }> {
  const { data, error } = await session.supabase.rpc("create_house", {
    p_name: input.name,
    p_address: input.address?.trim() ? input.address.trim() : undefined,
    p_timezone: input.timezone,
    p_currency: input.currency,
    p_type: input.homeType,
    // Context for food suggestions and nothing else (HM-03, SEC-18).
    p_country_code: input.location?.countryCode || undefined,
    p_state: input.location?.state || undefined,
    p_city: input.location?.city || undefined,
    p_area: input.location?.area || undefined,
  });
  if (error) throw apiErrorFromPostgres(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new ApiError("INTERNAL");
  return {
    houseId: row.house_id,
    inviteCode: row.invite_code,
    inviteToken: row.invite_token,
  };
}

/*
 * `joinHouse` and `regenerateInviteCode` used to live here.
 *
 * They are gone, not deprecated: a six-character code that created a
 * membership on possession is exactly the admin-creates-member shape HM-06
 * removes. What replaces them is in `lib/data/homes.ts` — an invite link, a
 * request the person raises themselves, and a lead who accepts it.
 */

export async function updateSettings(
  session: Session,
  houseId: string,
  input: {
    penalty_rate?: string;
    expense_approval_threshold?: string;
    auto_confirm_hours?: number;
    schedule_generation_dow?: number;
    schedule_generation_hour?: number;
    carry_cap_percent?: number;
    llm_scheduling_enabled?: boolean;
    money_mode?: MoneyMode;
    effort_mode?: EffortMode;
    penalty_enabled?: boolean;
    daily_budget?: string;
  },
): Promise<HouseSettingsRow> {
  const patch: Partial<HouseSettingsRow> = {};
  if (input.penalty_rate !== undefined) {
    patch.penalty_rate_paise = rupeesToPaise(input.penalty_rate);
  }
  if (input.expense_approval_threshold !== undefined) {
    patch.expense_approval_threshold_paise = rupeesToPaise(
      input.expense_approval_threshold,
    );
  }
  if (input.auto_confirm_hours !== undefined) {
    patch.auto_confirm_hours = input.auto_confirm_hours;
  }
  if (input.schedule_generation_dow !== undefined) {
    patch.schedule_generation_dow = input.schedule_generation_dow;
  }
  if (input.money_mode !== undefined) patch.money_mode = input.money_mode;
  if (input.effort_mode !== undefined) patch.effort_mode = input.effort_mode;
  if (input.penalty_enabled !== undefined) {
    patch.penalty_enabled = input.penalty_enabled;
  }
  if (input.daily_budget !== undefined) {
    // An empty string is the house saying it has no daily target, which is a
    // different thing from not having said anything.
    patch.daily_budget_paise = input.daily_budget.trim()
      ? rupeesToPaise(input.daily_budget)
      : null;
  }
  if (input.schedule_generation_hour !== undefined) {
    patch.schedule_generation_hour = input.schedule_generation_hour;
  }
  if (input.carry_cap_percent !== undefined) {
    patch.carry_cap_percent = input.carry_cap_percent;
  }
  if (input.llm_scheduling_enabled !== undefined) {
    patch.llm_scheduling_enabled = input.llm_scheduling_enabled;
  }

  const { data, error } = await session.supabase
    .from("house_settings")
    .update(patch)
    .eq("house_id", houseId)
    .select("*")
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return data;
}

/**
 * Role, residency and the cooking flag. Not status: a Requested person becomes
 * Active by having their request accepted, and an Active person becomes
 * Inactive only through an applied `remove_member` decision (056), which knows
 * about money still owed.
 */
export async function updateMember(
  session: Session,
  houseId: string,
  memberId: string,
  input: {
    role?: MemberRole;
    residency?: "full_time" | "weekday_only" | "weekend_only";
    can_cook?: boolean;
  },
) {
  const patch: Partial<HouseMemberRow> = { ...input };

  const { data, error } = await session.supabase
    .from("house_members")
    .update(patch)
    .eq("id", memberId)
    .eq("house_id", houseId)
    .select("*")
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");
  return data;
}

// Removal used to live here, as a wrapper around the `remove_member` RPC.
// Migration 056 dropped that function and phase 11 moved the act itself behind
// a `remove_member` decision, so the only caller is now `apply_decision_effect`
// in SQL. The two states D-45 asks for did not change; who may start one did.

/**
 * Adds a resident who has no account — a child, an elderly parent, anybody the
 * house feeds and does not bill.
 *
 * Everything the rule depends on is enforced in the database: only an admin may
 * do this, a non-paying dependent must name a guardian, and a member without a
 * login must carry their own display name. The check here exists for the error
 * message, not for the guarantee.
 */
export async function addDependent(
  session: Session,
  houseId: string,
  input: {
    name: string;
    guardianMemberId?: string;
    sharesCost: boolean;
    doesChores: boolean;
    residency: ResidencyType;
  },
): Promise<HouseMemberRow> {
  const { data, error } = await session.supabase.rpc("add_dependent", {
    p_house_id: houseId,
    p_name: input.name,
    p_guardian_id: (input.guardianMemberId ?? null) as string,
    p_shares_cost: input.sharesCost,
    p_does_chores: input.doesChores,
    p_residency: input.residency,
  });
  if (error) throw apiErrorFromPostgres(error);
  const row = (Array.isArray(data) ? data[0] : data) as HouseMemberRow | null;
  if (!row) throw new ApiError("INTERNAL");
  return row;
}

/**
 * Removes a dependent. Deactivation rather than deletion, and for the same
 * reason a departing member is deactivated: their share of last month's
 * groceries is a fact, and deleting the row would rewrite a settled ledger.
 *
 * Refuses on an adult. An adult with a login leaves through the ordinary
 * member flow, which has its own rules about handing over admin.
 */
export async function removeDependent(
  session: Session,
  houseId: string,
  memberId: string,
): Promise<void> {
  const { data, error } = await session.supabase
    .from("house_members")
    .update({ status: "inactive", left_date: new Date().toISOString().slice(0, 10) })
    .eq("id", memberId)
    .eq("house_id", houseId)
    .eq("member_kind", "dependent")
    .select("id")
    .maybeSingle();

  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");
}

export async function claimUsername(session: Session, username: string) {
  const { data, error } = await session.supabase.rpc("claim_username", {
    p_username: username,
  });
  if (error) {
    const mapped = apiErrorFromPostgres(error);
    throw mapped.code === "INTERNAL" ? new ApiError("USERNAME_TAKEN") : mapped;
  }
  return data as unknown as string;
}

export async function updateOwnProfile(
  session: Session,
  input: { display_name?: string; phone?: string; upi_vpa?: string; username?: string },
) {
  // Uniqueness belongs to claim_username, not to an update on the profile row.
  if (input.username !== undefined) {
    await claimUsername(session, input.username);
  }

  const patch: Partial<UserRow> = {};
  if (input.display_name !== undefined) patch.display_name = input.display_name;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.upi_vpa !== undefined) patch.upi_vpa = input.upi_vpa || null;

  if (Object.keys(patch).length === 0) {
    const { data } = await session.supabase
      .from("users")
      .select("*")
      .eq("id", session.userId)
      .single();
    return data;
  }

  const { data, error } = await session.supabase
    .from("users")
    .update(patch)
    .eq("id", session.userId)
    .select("*")
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return data;
}

export async function setOwnCookingFlag(
  session: Session,
  memberId: string,
  canCook: boolean,
) {
  const { data, error } = await session.supabase
    .from("house_members")
    .update({ can_cook: canCook })
    .eq("id", memberId)
    .eq("user_id", session.userId)
    .select("*")
    .maybeSingle();
  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_YOUR_RECORD");
  return data;
}

export async function createRoom(
  session: Session,
  houseId: string,
  input: { name: string; capacity: number; monthly_rent: string },
): Promise<RoomRow> {
  const { data, error } = await session.supabase
    .from("rooms")
    .insert({
      house_id: houseId,
      name: input.name,
      capacity: input.capacity,
      monthly_rent_paise: rupeesToPaise(input.monthly_rent),
    })
    .select("*")
    .single();
  if (error) throw apiErrorFromPostgres(error);
  return data;
}

export async function updateRoom(
  session: Session,
  houseId: string,
  roomId: string,
  input: { name?: string; capacity?: number; monthly_rent?: string },
): Promise<RoomRow> {
  const patch: Partial<RoomRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.monthly_rent !== undefined) {
    patch.monthly_rent_paise = rupeesToPaise(input.monthly_rent);
  }

  const { data, error } = await session.supabase
    .from("rooms")
    .update(patch)
    .eq("id", roomId)
    .eq("house_id", houseId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw apiErrorFromPostgres(error);
  if (!data) throw new ApiError("NOT_FOUND");
  return data;
}

/** BR-012 — refused while the room has current occupants. Soft delete. */
export async function deleteRoom(session: Session, roomId: string): Promise<void> {
  const { error } = await session.supabase.rpc("delete_room", { p_room_id: roomId });
  if (error) throw apiErrorFromPostgres(error);
}

/** BR-011 — closes the previous assignment and opens a new one. */
export async function assignRoom(
  session: Session,
  roomId: string,
  memberId: string,
  fromDate?: string,
): Promise<string> {
  const { data, error } = await session.supabase.rpc("assign_room", {
    p_room_id: roomId,
    p_member_id: memberId,
    p_from_date: fromDate ?? undefined,
  });
  if (error) throw apiErrorFromPostgres(error);
  return data as unknown as string;
}
