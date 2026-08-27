import type {
  EffortMode,
  HouseMemberRow,
  HouseRow,
  HouseSettingsRow,
  HomeType,
  MemberKind,
  MemberRole,
  MemberStatus,
  MoneyMode,
  ResidencyType,
  RoomRow,
} from "./database";

/**
 * A member joined to their user profile and their current room.
 *
 * `userId` is null for a dependent — a child, an elderly parent — who lives in
 * the house, counts as a head, may hold chores, and has no account. Everything
 * that reads this type has to cope with that, which is why the field is
 * nullable rather than a convenient empty string.
 */
export interface MemberView {
  id: string;
  userId: string | null;
  displayName: string;
  username: string | null;
  email: string;
  avatarUrl: string | null;
  /** Null while Requested — there is no role to have before acceptance (HM-07). */
  role: MemberRole | null;
  status: MemberStatus;
  residency: ResidencyType;
  canCook: boolean;
  joinedDate: string;
  leftDate: string | null;
  room: { id: string; name: string } | null;
  kind: MemberKind;
  /** False for a resident whose share is carried by their guardian. */
  sharesCost: boolean;
  /** False for a resident the scheduler must not give work to. */
  doesChores: boolean;
  guardianMemberId: string | null;
  /** True for somebody removed while money was still outstanding (D-45). */
  pendingSettlement: boolean;
}

export interface RoomView {
  id: string;
  name: string;
  capacity: number;
  monthlyRentPaise: number;
  occupants: { memberId: string; displayName: string; avatarUrl: string | null }[];
}

/** Everything a screen needs about the caller's house, in one object. */
export interface HouseContext {
  house: HouseRow;
  settings: HouseSettingsRow;
  rooms: RoomView[];
  members: MemberView[];
  me: MemberView;
  isAdmin: boolean;
  /** Admin or Co-Admin. The operational tier, `is_house_lead()` in the database. */
  isLead: boolean;
  /**
   * The household's shape, pulled up from house and settings because almost
   * every screen branches on it and digging two levels down at each call site
   * is how one screen ends up showing a family a settlement sheet.
   */
  shape: HouseShape;
}

export interface HouseShape {
  homeType: HomeType;
  moneyMode: MoneyMode;
  effortMode: EffortMode;
  penaltyEnabled: boolean;
  /** True when expenses create no debts: recorded, categorised, never netted. */
  isPot: boolean;
  isFamily: boolean;
}

export function houseShapeOf(house: HouseRow, settings: HouseSettingsRow): HouseShape {
  return {
    homeType: house.home_type,
    moneyMode: settings.money_mode,
    effortMode: settings.effort_mode,
    penaltyEnabled: settings.penalty_enabled,
    isPot: settings.money_mode === "pot",
    isFamily: house.home_type === "family",
  };
}

export type { HouseMemberRow, HouseRow, HouseSettingsRow, RoomRow };

export const RESIDENCY_LABEL: Record<ResidencyType, string> = {
  full_time: "Full time",
  weekday_only: "Weekdays only",
  weekend_only: "Weekends only",
};

export const HOME_TYPE_LABEL: Record<HomeType, string> = {
  shared: "Shared home",
  family: "Family home",
};

export const MEMBER_KIND_LABEL: Record<MemberKind, string> = {
  adult: "Adult",
  dependent: "Dependent",
};

export const STATUS_LABEL: Record<MemberStatus, string> = {
  requested: "Requested",
  active: "Active",
  inactive: "Inactive",
};
