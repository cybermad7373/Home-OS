import "server-only";

import { ApiError } from "@/lib/api/errors";
import { computeSplit, SplitError, type SplitShare } from "@/lib/domain/expenses/split";
import { rupeesToPaise } from "@/lib/utils/money";
import { houseToday } from "@/lib/utils/date";
import { createExpense, getPeriod, splitContextOn } from "./expenses";
import type { Session } from "./house";
import type { SplitBasis } from "@/lib/types/database";

/**
 * The thin layer between a route handler and the two halves it coordinates:
 * the pure split calculator, and the repository that stores what it produced.
 *
 * The date rules live here because they are policy, not arithmetic: how far
 * back an expense may be dated, and what happens when its month is closed.
 */

/** BR-082 — an expense may be dated at most 180 days in the past. */
const MAX_BACKDATE_DAYS = 180;

export interface PreparedSplit {
  splits: SplitShare[];
  amountPaise: number;
  heads: number;
  period: string;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86400000);
}

/** BR-081, BR-082 — no future dates, nothing older than 180 days. */
export function assertDateAllowed(expenseDate: string, timezone: string): void {
  const today = houseToday(timezone);

  if (expenseDate > today) {
    throw new ApiError("FUTURE_DATE", { expenseDate, today });
  }
  if (daysBetween(expenseDate, today) > MAX_BACKDATE_DAYS) {
    throw new ApiError("TOO_OLD", { expenseDate, maxDays: MAX_BACKDATE_DAYS });
  }
}

function toSplitError(error: unknown): never {
  if (error instanceof SplitError) {
    switch (error.code) {
      case "CUSTOM_MISMATCH":
        throw new ApiError("SPLIT_MISMATCH", error.details);
      case "CUSTOM_NEGATIVE":
        throw new ApiError("SPLIT_NEGATIVE", error.details);
      case "CUSTOM_UNKNOWN_MEMBER":
        throw new ApiError("SPLIT_UNKNOWN_MEMBER", error.details);
      case "NO_OCCUPIED_ROOMS":
        throw new ApiError("NO_ROOMS_CONFIGURED", error.details);
      case "PAYER_REQUIRED":
      case "PAYER_NOT_A_MEMBER":
        throw new ApiError("NO_PARTICIPANTS", error.details);
      default:
        throw new ApiError("NO_PARTICIPANTS", error.details);
    }
  }
  throw error;
}

/**
 * Computes the split for an expense that has not been written yet — used both
 * by the live preview in the add sheet and by creation itself, so the number
 * somebody saw under the button is the number that gets stored.
 */
export async function prepareSplit(
  session: Session,
  houseId: string,
  input: {
    amount: string;
    expenseDate: string;
    splitBasis: SplitBasis;
    customShares?: { member_id: string; amount: string }[];
    /** Required for the "payer" basis; ignored by every other one. */
    paidByMemberId?: string;
  },
): Promise<PreparedSplit> {
  const amountPaise = rupeesToPaise(input.amount);
  const context = await splitContextOn(session, houseId, input.expenseDate);

  let splits: SplitShare[];
  try {
    splits = computeSplit({
      amountPaise,
      expenseDate: input.expenseDate,
      basis: input.splitBasis,
      members: context.members,
      rooms: context.rooms,
      guests: context.guests,
      customShares: input.customShares?.map((share) => ({
        memberId: share.member_id,
        sharePaise: rupeesToPaise(share.amount),
      })),
      paidByMemberId: input.paidByMemberId,
    });
  } catch (error) {
    toSplitError(error);
  }

  // Heads that have no row of their own: guests, and residents whose share is
  // carried by somebody else. Counting the rows with a non-zero carried amount
  // would undercount a member looking after two people, so count the sources.
  const carriedHeads =
    input.splitBasis === "payer"
      ? 0
      : context.guests.filter((guest) => guest.countsForExpense).length +
        context.members.filter((member) => member.sharesCost === false).length;

  return {
    splits,
    amountPaise,
    heads: input.splitBasis === "payer" ? 1 : splits.length + carriedHeads,
    period: input.expenseDate.slice(0, 7),
  };
}

/**
 * Creates an expense, refusing when its month is already closed.
 *
 * A closed month is not a wall — it is a fork. The caller is told which two
 * options exist (carry the expense forward as a tagged adjustment, or ask an
 * admin to reopen), because silently discarding a real ₹800 of groceries is
 * how a ledger stops being trusted. Resolving that fork is phase 3.
 */
export async function createExpenseWithSplit(
  session: Session,
  houseId: string,
  timezone: string,
  input: {
    amount: string;
    categoryId: string;
    expenseDate: string;
    splitBasis: SplitBasis;
    description?: string;
    paidByMemberId?: string;
    receiptUrl?: string;
    customShares?: { member_id: string; amount: string }[];
    /** The member the split is attributed to under the "payer" basis. */
    payerMemberId: string;
  },
): Promise<{ id: string; period: string; splits: SplitShare[] }> {
  assertDateAllowed(input.expenseDate, timezone);

  const prepared = await prepareSplit(session, houseId, {
    amount: input.amount,
    expenseDate: input.expenseDate,
    splitBasis: input.splitBasis,
    customShares: input.customShares,
    paidByMemberId: input.payerMemberId,
  });

  const period = await getPeriod(session, houseId, prepared.period);
  if (period?.status === "closed") {
    throw new ApiError(
      "PERIOD_CLOSED",
      {
        period: prepared.period,
        options: ["carry_forward", "request_reopen"],
      },
      `The ${prepared.period} period is closed. Post this as an adjustment, or ask an admin to reopen it.`,
    );
  }

  const id = await createExpense(session, houseId, {
    categoryId: input.categoryId,
    amountPaise: prepared.amountPaise,
    expenseDate: input.expenseDate,
    splitBasis: input.splitBasis,
    splits: prepared.splits,
    description: input.description,
    paidByMemberId: input.paidByMemberId,
    receiptUrl: input.receiptUrl,
  });

  return { id, period: prepared.period, splits: prepared.splits };
}
