import "server-only";

import { listAbsences } from "./absence";
import { listAssignments } from "./chores";
import { listExpenses } from "./expenses";
import { listDecisions } from "./governance";
import { listMealPlans, listMeals } from "./food";
import type { Session } from "./house";
import type { HouseContext } from "@/lib/types/domain";
import { DECISION_TYPE_LABEL } from "@/lib/types/domain";
import {
  boundsOfMonth,
  completionRate,
  datesOfMonth,
  datesOfWeek,
  dayDensity,
  mealSpend,
  moneyRollup,
  pointsByMember,
  type CompletionRate,
  type DayDensity,
  type MealSpend,
  type MoneyRollup,
} from "@/lib/domain/home/calendar";
import { presenceOn, type Presence } from "@/lib/domain/home/today";

/**
 * The Calendar's reads — S-52, docs/05-API-SPEC.md section 11.
 *
 * **The Calendar owns no data.** Every figure here is composed from chores,
 * money, food, presence and decisions, and nothing in this file writes. The
 * arithmetic is in lib/domain/home/calendar.ts, which knows nothing about a
 * database; this file is only the gathering.
 */

export interface CalendarDay {
  date: string;
  presence: Presence;
  chores: {
    id: string;
    name: string;
    assigneeName: string | null;
    status: string;
    effortPoints: number;
  }[];
  money: {
    totalPaise: number;
    pendingApprovals: number;
    expenses: { id: string; description: string; amountPaise: number; status: string }[];
  };
  /** What was eaten. */
  food: { id: string; name: string; source: string; totalCostPaise: number }[];
  /** What is intended and not yet eaten (FD-20) — visually distinct on the screen. */
  plannedFood: { id: string; name: string }[];
  pendingDecisions: { id: string; label: string; level: string }[];
}

/**
 * One date, in one round of reads. The acceptance criterion is explicit: the
 * day view shows presence, chores, money, food and pending decisions for any
 * date **in one request**.
 */
export async function getCalendarDay(
  session: Session,
  context: HouseContext,
  date: string,
): Promise<CalendarDay> {
  const [absences, chores, expenses, meals, plans, decisions] = await Promise.all([
    listAbsences(session, context.house.id, { from: date }),
    listAssignments(session, context.house.id, { from: date, to: date }),
    listExpenses(session, context.house.id, context.me.id, { from: date, to: date }),
    listMeals(session, context.house.id, { from: date, to: date }),
    listMealPlans(session, context.house.id, { from: date, to: date }),
    listDecisions(session, context.house.id, context.me.id, { status: "waiting" }),
  ]);

  const money = moneyRollup(
    expenses.expenses.map((expense) => ({
      amountPaise: expense.amountPaise,
      status: expense.status,
    })),
  );

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
    chores: chores.map((chore) => ({
      id: chore.id,
      name: chore.name,
      assigneeName: chore.assignee?.displayName ?? null,
      status: chore.status,
      effortPoints: chore.effortPoints,
    })),
    money: {
      ...money,
      expenses: expenses.expenses.map((expense) => ({
        id: expense.id,
        description: expense.description ?? expense.category.name,
        amountPaise: expense.amountPaise,
        status: expense.status,
      })),
    },
    food: meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      source: meal.source,
      totalCostPaise: meal.totalCostPaise,
    })),
    plannedFood: plans
      .filter((plan) => plan.confirmedMealId === null)
      .map((plan) => ({ id: plan.id, name: plan.name })),
    pendingDecisions: decisions.decisions.map((decision) => ({
      id: decision.id,
      label: DECISION_TYPE_LABEL[decision.type],
      level: decision.level,
    })),
  };
}

export interface CalendarWeek {
  weekStart: string;
  dates: string[];
  points: { memberId: string; displayName: string; points: number }[];
  money: MoneyRollup;
  mealsLogged: number;
  /** One entry per date, so the week grid can show density without a second read. */
  perDay: DayDensity[];
}

export async function getCalendarWeek(
  session: Session,
  context: HouseContext,
  weekStart: string,
): Promise<CalendarWeek> {
  const dates = datesOfWeek(weekStart);
  const from = dates[0];
  const to = dates[6];

  const [chores, expenses, meals] = await Promise.all([
    listAssignments(session, context.house.id, { from, to }),
    listExpenses(session, context.house.id, context.me.id, { from, to, pageSize: 200 }),
    listMeals(session, context.house.id, { from, to }),
  ]);

  const names = new Map(context.members.map((member) => [member.id, member.displayName]));

  return {
    weekStart,
    dates,
    points: pointsByMember(
      chores.map((chore) => ({
        status: chore.status,
        effortPoints: chore.effortPoints,
        assigneeMemberId: chore.assignee?.memberId ?? null,
      })),
    ).map((row) => ({ ...row, displayName: names.get(row.memberId) ?? "Someone" })),
    money: moneyRollup(
      expenses.expenses.map((expense) => ({
        amountPaise: expense.amountPaise,
        status: expense.status,
      })),
    ),
    mealsLogged: meals.length,
    perDay: dayDensity(dates, chores, meals, expenses.expenses),
  };
}

export interface CalendarMonth {
  period: string;
  /** Every date of the month, so the grid does not recompute the calendar. */
  dates: string[];
  /** One entry per date. The month read already holds every row it needs. */
  perDay: DayDensity[];
  money: MoneyRollup;
  points: { memberId: string; displayName: string; points: number }[];
  completion: CompletionRate;
  mealsLogged: number;
  mealSpend: MealSpend;
}

export async function getCalendarMonth(
  session: Session,
  context: HouseContext,
  period: string,
): Promise<CalendarMonth> {
  const { from, to } = boundsOfMonth(period);

  const [chores, expenses, meals] = await Promise.all([
    listAssignments(session, context.house.id, { from, to }),
    listExpenses(session, context.house.id, context.me.id, { period, pageSize: 500 }),
    listMeals(session, context.house.id, { from, to }),
  ]);

  const names = new Map(context.members.map((member) => [member.id, member.displayName]));
  const forRollup = chores.map((chore) => ({
    status: chore.status,
    effortPoints: chore.effortPoints,
    assigneeMemberId: chore.assignee?.memberId ?? null,
  }));

  const dates = datesOfMonth(period);

  return {
    period,
    dates,
    perDay: dayDensity(dates, chores, meals, expenses.expenses),
    money: moneyRollup(
      expenses.expenses.map((expense) => ({
        amountPaise: expense.amountPaise,
        status: expense.status,
      })),
    ),
    points: pointsByMember(forRollup).map((row) => ({
      ...row,
      displayName: names.get(row.memberId) ?? "Someone",
    })),
    completion: completionRate(forRollup),
    mealsLogged: meals.length,
    mealSpend: mealSpend(
      meals.map((meal) => ({ source: meal.source, totalCostPaise: meal.totalCostPaise })),
    ),
  };
}
