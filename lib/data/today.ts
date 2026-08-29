import "server-only";

import { listLiveAnnouncements, type AnnouncementView } from "./announcements";
import { listAbsences } from "./absence";
import { listAssignments, listAwaitingConfirmation } from "./chores";
import { listExpenses, listPendingApprovals } from "./expenses";
import { listDecisions } from "./governance";
import { getSuggestions, listMealPlans, listMeals } from "./food";
import type { Session } from "./house";
import type { HouseContext } from "@/lib/types/domain";
import { DECISION_TYPE_LABEL } from "@/lib/types/domain";
import {
  needsYou,
  presenceOn,
  type NeedsYouItem,
  type Presence,
} from "@/lib/domain/home/today";
import type { AssignmentView } from "./chores";
import type { ExpenseView } from "./expenses";
import type { MealPlanView, MealView } from "./food";
import type { ScoredFood } from "@/lib/domain/food/recommend";
import { formatMoney } from "@/lib/utils/money";
import { houseToday } from "@/lib/utils/date";

/**
 * Today's read — S-50, and `GET /api/today`.
 *
 * One function, called by both the screen and the route, so a client written
 * against the endpoint and the server-rendered page can never show different
 * days. Everything here is a query; the two judgements Today makes — the order
 * of "Needs you" and who counts as present — are in lib/domain/home/today.ts.
 *
 * Every block is gathered in one round of parallel reads. The acceptance
 * criterion is that Today answers "what is happening now" without scrolling on
 * a 360 px screen, which it cannot do if it also takes six sequential queries.
 */

export interface TodayView {
  date: string;
  presence: Presence;
  /** The caller's own chores for today, whatever their state. */
  myChores: AssignmentView[];
  needsYou: NeedsYouItem[];
  money: {
    totalPaise: number;
    /** Today's expenses, newest first, for the one-line summary. */
    expenses: ExpenseView[];
  };
  food: {
    /** What was actually eaten today. */
    meals: MealView[];
    /** What was planned for today and not yet confirmed as eaten (FD-20). */
    plans: MealPlanView[];
    /** At most two, from the Home's own library. Never fabricated. */
    suggestions: ScoredFood[];
    coldStart: boolean;
  };
  announcements: AnnouncementView[];
}

export async function getToday(
  session: Session,
  context: HouseContext,
): Promise<TodayView> {
  const date = houseToday(context.house.timezone);

  const [
    absences,
    myChores,
    confirmations,
    approvals,
    decisions,
    expenses,
    meals,
    plans,
    suggestions,
    announcements,
  ] = await Promise.all([
    listAbsences(session, context.house.id, { from: date }),
    listAssignments(session, context.house.id, { from: date, to: date }, context.me.id),
    listAwaitingConfirmation(session, context.house.id, context.me.id),
    listPendingApprovals(session, context.house.id, context.me.id),
    listDecisions(session, context.house.id, context.me.id, { scope: "mine" }),
    listExpenses(session, context.house.id, context.me.id, { from: date, to: date }),
    listMeals(session, context.house.id, { from: date, to: date }),
    listMealPlans(session, context.house.id, { from: date, to: date }),
    // The library half only. The AI half is a second network call with its own
    // latency and its own failure mode, and Today is the screen that must not
    // wait; the Food screen is where ideas are asked for.
    getSuggestions(session, context.house.id, context.me.id, "dinner", context.house.state ?? null),
    listLiveAnnouncements(session, context.house.id),
  ]);

  const currency = context.house.currency;

  return {
    date,
    presence: presenceOn(
      date,
      context.members
        .filter((member) => member.status === "active")
        .map((member) => ({ memberId: member.id, displayName: member.displayName })),
      absences.map((absence) => ({
        memberId: absence.memberId,
        fromDate: absence.fromDate,
        toDate: absence.toDate,
        status: absence.status,
      })),
    ),
    myChores,
    needsYou: needsYou({
      decisions: decisions.decisions.map((decision) => ({
        id: decision.id,
        label: DECISION_TYPE_LABEL[decision.type],
        level: decision.level,
        createdAt: decision.createdAt,
        approvalsGiven: decision.progress.approvals.given,
        approvalsRequired: decision.progress.approvals.required,
      })),
      confirmations: confirmations.map((assignment) => ({
        id: assignment.id,
        choreName: assignment.name,
        assigneeName: assignment.assignee?.displayName ?? "Someone",
        doneAt: assignment.doneAt,
        createdAt: assignment.deadline,
        received: assignment.quorum.received,
        required: assignment.quorum.required,
      })),
      approvals: approvals.map((expense) => ({
        id: expense.id,
        description: expense.description ?? expense.category.name,
        payerName: expense.paidBy.displayName,
        amountLabel: formatMoney(expense.amountPaise, { currency }),
        createdAt: expense.createdAt,
      })),
    }),
    money: { totalPaise: expenses.totalPaise, expenses: expenses.expenses },
    food: {
      meals,
      // A plan already confirmed as eaten is a meal, and showing it twice would
      // read as the Home having eaten it twice.
      plans: plans.filter((plan) => plan.confirmedMealId === null),
      suggestions: suggestions.suggestions.slice(0, 2),
      coldStart: suggestions.coldStart,
    },
    announcements,
  };
}
