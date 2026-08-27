import type { QueueGroup } from "@/lib/domain/governance/queue";
import type {
  DecisionLevel,
  DecisionStatus,
  DecisionType,
} from "@/lib/domain/governance/types";
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

// ---------------------------------------------------------------------------
// Governance — docs/14-GOVERNANCE-SPEC.md, S-35 and S-36
// ---------------------------------------------------------------------------

/**
 * A decision names two things on every card: what is being asked, and what
 * changes if it happens (AP-02). The second one is the half people actually
 * decide on, so it is written per type rather than left to the reader.
 */
export const DECISION_TYPE_LABEL: Record<DecisionType, string> = {
  close_settlement: "Close the month",
  reopen_settlement: "Reopen a closed month",
  remove_member: "Remove a member",
  change_rule: "Change a house rule",
  change_governance: "Change how decisions are made",
  change_home_mode: "Change how the home works",
  balance_adjustment: "Adjust a balance",
  absence_request: "Time away",
  join_request: "Somebody wants to join",
  expense_approval: "An expense",
  chore_confirmation: "A chore was done",
  set_expected_contribution: "Set an expected contribution",
  create_reserve: "Start a reserve",
  reserve_draw: "Draw from the reserve",
};

export const DECISION_EFFECT: Record<DecisionType, string> = {
  close_settlement:
    "The month is settled: who pays whom is fixed from the numbers at that moment, and nothing in it can be edited afterwards.",
  reopen_settlement:
    "The closed month opens again and its settlement is withdrawn until it is closed a second time.",
  remove_member:
    "They stop being a member. Anything they still owe or are owed stays outstanding until it is settled.",
  change_rule: "The rule takes effect in its new form, and the old version is kept.",
  change_governance:
    "How every future decision is made changes — who is asked, and how many must agree.",
  change_home_mode: "How the home splits money or shares work changes for everybody.",
  balance_adjustment: "Somebody's balance moves by the stated amount.",
  absence_request:
    "Their chores in that window move to somebody else, and the days do not count against them.",
  join_request: "They become a member and can see everything the home does.",
  expense_approval: "The expense counts, and everybody's share moves with it.",
  chore_confirmation: "The chore counts as done, and the points are awarded.",
  set_expected_contribution:
    "What this member is expected to put in each month changes. Nobody is charged anything by it.",
  create_reserve: "The home starts a shared reserve that expenses can be drawn from.",
  reserve_draw: "The amount leaves the reserve and covers the expense it was asked for.",
};

/**
 * The same decision, as a verb phrase: "{proposer} wants to {action}".
 *
 * N-32 and its family are rendered by database triggers, so the phrases exist
 * a second time as `decision_action_phrase` in migration 055, and
 * `tests/unit/governance-notifications.test.ts` reads that function and fails
 * if the two ever differ. One enforced agreement between two copies, which is
 * the arrangement the notification catalogue already lives under.
 */
export const DECISION_ACTION_PHRASE: Record<DecisionType, string> = {
  close_settlement: "close the month",
  reopen_settlement: "reopen a closed month",
  remove_member: "remove a member",
  change_rule: "change a house rule",
  change_governance: "change how decisions are made",
  change_home_mode: "change how the home works",
  balance_adjustment: "adjust a balance",
  absence_request: "take time away",
  join_request: "let somebody join",
  expense_approval: "approve an expense",
  chore_confirmation: "confirm a chore",
  set_expected_contribution: "set an expected contribution",
  create_reserve: "start a reserve",
  reserve_draw: "draw from the reserve",
};

export const QUEUE_GROUP_LABEL: Record<QueueGroup, string> = {
  expenses: "Expenses",
  chores: "Chores",
  absences: "Absences",
  join_requests: "Join requests",
  members: "Member changes",
  rules: "Rules",
  money: "Money",
  settlement: "Settlement",
};

export const DECISION_LEVEL_LABEL: Record<DecisionLevel, string> = {
  normal: "Normal",
  important: "Important",
  critical: "Critical",
};

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  waiting: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  lapsed: "Nobody answered in time",
  cancelled: "Withdrawn",
  applied: "Done",
};
