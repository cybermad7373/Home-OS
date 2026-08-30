/**
 * The shapes phase 15 reports on (docs/07-ROADMAP.md phase 15, IN-01..IN-10).
 *
 * Every input here is a flat, already-authorised fact read from the database.
 * The builders that consume them are pure, so a house's insight for a period
 * is a function of its records and nothing else — no clock, no session, no
 * second query hiding behind a getter.
 */

import type { Granularity } from "./buckets";

export type { Granularity };

/** The four things a house asks about itself. */
export const INSIGHT_TYPES = ["money", "chores", "food", "home"] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];

export interface InsightRange {
  /** Inclusive ISO date the range starts on, in the house's timezone. */
  from: string;
  /** Inclusive ISO date the range ends on. */
  to: string;
  granularity: Granularity;
}

export interface BucketTotal {
  key: string;
  totalPaise: number;
}

// ---------------------------------------------------------------- money ----

export interface MoneyExpense {
  expenseId: string;
  date: string;
  amountPaise: number;
  categoryId: string;
  categoryName: string;
  paidByMemberId: string;
  paidByName: string;
  /** Only approved expenses count towards a figure the house acts on. */
  approved: boolean;
}

export interface MoneySplit {
  expenseId: string;
  memberId: string;
  sharePaise: number;
  guestSharePaise: number;
  dependentSharePaise: number;
}

export interface InsightMember {
  memberId: string;
  displayName: string;
  active: boolean;
}

export interface MoneyInsightsInput {
  range: InsightRange;
  expenses: MoneyExpense[];
  splits: MoneySplit[];
  members: InsightMember[];
  /** Filters narrow the view; they never change how a figure is computed. */
  categoryFilter?: string;
  memberFilter?: string;
  /** A pot house records spending but nets no debts (D-19), so it gets none. */
  isPot: boolean;
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  totalPaise: number;
  /** Against the previous bucket. `null` when there is no previous bucket. */
  changePct: number | null;
}

export interface WhoPaid {
  memberId: string;
  name: string;
  totalPaise: number;
}

export interface PaidVsShare {
  memberId: string;
  name: string;
  paidPaise: number;
  fairSharePaise: number;
  /** Paid minus fair share. Positive means the house owes them. */
  netPaise: number;
}

export interface OwedEdge {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountPaise: number;
}

export interface MoneyInsightsOutput {
  range: InsightRange;
  buckets: BucketTotal[];
  totalPaise: number;
  pendingPaise: number;
  byCategory: CategoryTotal[];
  whoPaid: WhoPaid[];
  paidVsShare: PaidVsShare[];
  owed: OwedEdge[];
}

// --------------------------------------------------------------- chores ----

export type AssignmentStatus =
  | "assigned"
  | "open"
  | "done_pending"
  | "confirmed"
  | "rejected"
  | "missed"
  | "cancelled";

export interface ChoreAssignment {
  assignmentId: string;
  /** The day the chore was due, in the house's timezone. */
  choreDate: string;
  memberId: string | null;
  memberName: string;
  templateName: string;
  points: number;
  status: AssignmentStatus;
}

export interface ChoreInsightsInput {
  range: InsightRange;
  assignments: ChoreAssignment[];
  members: InsightMember[];
  memberFilter?: string;
  /**
   * A family Home sees contribution, not a ranking (BR-260). The builder still
   * computes the same figures; it flags that they must not be ordered as a
   * league table, and drops the concentration metric that only means something
   * where members are being compared.
   */
  isFamily: boolean;
}

export interface MemberWorkload {
  memberId: string;
  memberName: string;
  assignedPoints: number;
  confirmedPoints: number;
  pendingPoints: number;
  missedPoints: number;
  /** Confirmed over assigned. `null` when nothing was assigned to them. */
  completionRate: number | null;
}

export interface WorkloadBucket {
  key: string;
  assignedPoints: number;
  confirmedPoints: number;
  missedPoints: number;
}

export interface ChoreInsightsOutput {
  range: InsightRange;
  buckets: WorkloadBucket[];
  byMember: MemberWorkload[];
  ranked: boolean;
  summary: {
    assignedPoints: number;
    confirmedPoints: number;
    pendingPoints: number;
    missedPoints: number;
    /** Confirmed over assigned. `null` when nothing was scheduled at all. */
    completionRate: number | null;
    /** Share of confirmed points earned by the top three. `null` in a family. */
    topThreeShare: number | null;
  };
}

// ----------------------------------------------------------------- food ----

export type MealSource = "home_cooked" | "bought" | "ordered" | "other";
export type FoodRating = "like" | "okay" | "dislike";

export interface MealRecord {
  mealId: string;
  date: string;
  name: string;
  /** Normalised so "Dosa" and "dosa" are one dish in every count. */
  normalisedName: string;
  source: MealSource;
  costPaise: number;
  participantMemberIds: string[];
}

export interface FoodOpinion {
  normalisedName: string;
  name: string;
  memberId: string;
  rating: FoodRating;
}

export interface FoodInsightsInput {
  range: InsightRange;
  meals: MealRecord[];
  opinions: FoodOpinion[];
  memberFilter?: string;
}

export interface MostLiked {
  name: string;
  likes: number;
  dislikes: number;
  /** Likes minus dislikes. Ties break on the dish eaten more often. */
  score: number;
  timesEaten: number;
}

export interface RecentMeal {
  name: string;
  date: string;
  source: MealSource;
  costPaise: number;
}

export interface MostRepeated {
  name: string;
  times: number;
}

export interface FoodInsightsOutput {
  range: InsightRange;
  buckets: BucketTotal[];
  homeCookedPaise: number;
  outsidePaise: number;
  homeCookedMeals: number;
  outsideMeals: number;
  totalPaise: number;
  mostLiked: MostLiked[];
  recent: RecentMeal[];
  mostRepeated: MostRepeated[];
}

// ----------------------------------------------------------------- home ----

export interface HomeInsightsInput {
  range: InsightRange;
  expenseCount: number;
  mealCount: number;
  choresConfirmed: number;
  choresMissed: number;
  decisionsOpen: number;
  decisionsResolved: number;
  activeMembers: number;
  /** Confirmed effort points per member over the range. */
  effortByMember: { memberId: string; displayName: string; points: number }[];
  isFamily: boolean;
}

export interface HomeInsightsOutput {
  range: InsightRange;
  activity: {
    expenses: number;
    meals: number;
    choresConfirmed: number;
    choresMissed: number;
    /** Records per active member — "how busy is this Home" in one figure. */
    recordsPerMember: number | null;
  };
  decisions: {
    open: number;
    resolved: number;
  };
  imbalance: {
    /** The BRD's headline metric. `null` in a family, or with no effort yet. */
    topThreeShare: number | null;
    /** Furthest any member sat from the average, in points. */
    maxDeviationPoints: number | null;
  };
}

// ------------------------------------------------------------- position ----

export type ReserveMovementKind = string;

export interface PositionMemberInput {
  memberId: string;
  displayName: string;
  expectedContributionPaise: number;
  paidPaise: number;
  fairSharePaise: number;
}

export interface PositionReserveMovement {
  date: string;
  kind: ReserveMovementKind;
  amountPaise: number;
  note: string | null;
}

export interface FinancialPositionInput {
  period: string;
  members: PositionMemberInput[];
  reserveBalancePaise: number;
  reserveMovements: PositionReserveMovement[];
}

export interface PositionMember extends PositionMemberInput {
  /** Paid minus fair share — the same figure the settlement calls expense_net. */
  netPaise: number;
  /** Paid minus what they were asked to contribute. */
  contributionGapPaise: number;
}

export interface FinancialPositionOutput {
  period: string;
  members: PositionMember[];
  expectedPaise: number;
  actualPaise: number;
  fairSharePaise: number;
  /** Actual minus expected: what the Home took in over what it asked for. */
  surplusPaise: number;
  reserveBalancePaise: number;
  reserveMovements: PositionReserveMovement[];
}

// -------------------------------------------------------- explainability ----

export interface PointComponent {
  date: string;
  label: string;
  points: number;
  status: AssignmentStatus;
}

export interface PointBreakdownInput {
  memberId: string;
  displayName: string;
  /** The figure shown on the screen the caller tapped. */
  claimedPoints: number;
  components: PointComponent[];
}

export interface PointBreakdown {
  memberId: string;
  displayName: string;
  claimedPoints: number;
  componentPoints: number;
  /** False when the components do not sum to the figure — EF-12's own test. */
  reconciles: boolean;
  components: PointComponent[];
}
