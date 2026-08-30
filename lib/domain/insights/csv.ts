/**
 * CSV for the insights exports (IN-10, NFR-19).
 *
 * The escaping, the CRLF endings and the formula-injection guard all come from
 * lib/domain/analytics/csv — there is one `csvField` in this repository and
 * every export goes through it. A second copy is how one export ends up
 * shipping `=cmd|'/c calc'!A0` as a live formula because somebody forgot the
 * apostrophe.
 *
 * Pure: report shapes in, a string out.
 */

import { toCsv, type CsvValue } from "@/lib/domain/analytics/csv";
import { paiseToRupeeString } from "@/lib/utils/money";
import type {
  ChoreInsightsOutput,
  FinancialPositionOutput,
  FoodInsightsOutput,
  HomeInsightsOutput,
  MoneyInsightsOutput,
} from "./types";

const percent = (value: number | null): string =>
  value === null ? "" : (value * 100).toFixed(1);

/** Spend by bucket and by category, plus each member's position. */
export function moneyInsightsCsv(report: MoneyInsightsOutput): string {
  const rows: CsvValue[][] = [];

  for (const bucket of report.buckets) {
    rows.push(["Period", bucket.key, paiseToRupeeString(bucket.totalPaise), ""]);
  }
  for (const category of report.byCategory) {
    rows.push([
      "Category",
      category.name,
      paiseToRupeeString(category.totalPaise),
      category.changePct === null ? "" : `${category.changePct}%`,
    ]);
  }
  for (const member of report.paidVsShare) {
    rows.push([
      "Member net",
      member.name,
      paiseToRupeeString(member.netPaise),
      `paid ${paiseToRupeeString(member.paidPaise)} of ${paiseToRupeeString(member.fairSharePaise)}`,
    ]);
  }
  for (const edge of report.owed) {
    rows.push(["Owes", `${edge.fromName} to ${edge.toName}`, paiseToRupeeString(edge.amountPaise), ""]);
  }

  return toCsv(["Section", "Item", "Amount", "Detail"], rows);
}

/** Points per member, and the same figures bucketed over time. */
export function choreInsightsCsv(report: ChoreInsightsOutput): string {
  const rows: CsvValue[][] = report.byMember.map((member) => [
    "Member",
    member.memberName,
    member.assignedPoints,
    member.confirmedPoints,
    member.pendingPoints,
    member.missedPoints,
    percent(member.completionRate),
  ]);

  for (const bucket of report.buckets) {
    rows.push([
      "Period",
      bucket.key,
      bucket.assignedPoints,
      bucket.confirmedPoints,
      "",
      bucket.missedPoints,
      "",
    ]);
  }

  rows.push([
    "House",
    "All",
    report.summary.assignedPoints,
    report.summary.confirmedPoints,
    report.summary.pendingPoints,
    report.summary.missedPoints,
    percent(report.summary.completionRate),
  ]);

  return toCsv(
    ["Section", "Who", "Assigned", "Confirmed", "Pending", "Missed", "Completion %"],
    rows,
  );
}

/** Home-cooked against outside, spend over time, and the dish rankings. */
export function foodInsightsCsv(report: FoodInsightsOutput): string {
  const rows: CsvValue[][] = [
    ["Source", "Home cooked", report.homeCookedMeals, paiseToRupeeString(report.homeCookedPaise)],
    ["Source", "Outside", report.outsideMeals, paiseToRupeeString(report.outsidePaise)],
  ];

  for (const bucket of report.buckets) {
    rows.push(["Period", bucket.key, "", paiseToRupeeString(bucket.totalPaise)]);
  }
  for (const dish of report.mostLiked) {
    rows.push(["Most liked", dish.name, dish.timesEaten, `${dish.likes} liked, ${dish.dislikes} did not`]);
  }
  for (const dish of report.mostRepeated) {
    rows.push(["Most repeated", dish.name, dish.times, ""]);
  }
  for (const meal of report.recent) {
    rows.push(["Recent", meal.name, meal.date, paiseToRupeeString(meal.costPaise)]);
  }

  return toCsv(["Section", "Item", "Count", "Detail"], rows);
}

/** How active the Home is, what is waiting, and how unevenly work falls. */
export function homeInsightsCsv(report: HomeInsightsOutput): string {
  return toCsv(
    ["Measure", "Value"],
    [
      ["Expenses recorded", report.activity.expenses],
      ["Meals recorded", report.activity.meals],
      ["Chores confirmed", report.activity.choresConfirmed],
      ["Chores missed", report.activity.choresMissed],
      ["Records per member", report.activity.recordsPerMember ?? ""],
      ["Decisions open", report.decisions.open],
      ["Decisions resolved", report.decisions.resolved],
      ["Top-three effort share %", percent(report.imbalance.topThreeShare)],
      ["Furthest from average, points", report.imbalance.maxDeviationPoints ?? ""],
    ],
  );
}

/** Expected against actual, paid against fair share, and the reserve. */
export function positionCsv(report: FinancialPositionOutput): string {
  const rows: CsvValue[][] = report.members.map((member) => [
    "Member",
    member.displayName,
    paiseToRupeeString(member.expectedContributionPaise),
    paiseToRupeeString(member.paidPaise),
    paiseToRupeeString(member.fairSharePaise),
    paiseToRupeeString(member.netPaise),
  ]);

  rows.push([
    "House",
    "Total",
    paiseToRupeeString(report.expectedPaise),
    paiseToRupeeString(report.actualPaise),
    paiseToRupeeString(report.fairSharePaise),
    paiseToRupeeString(report.surplusPaise),
  ]);
  rows.push(["Reserve", "Balance", "", paiseToRupeeString(report.reserveBalancePaise), "", ""]);

  for (const movement of report.reserveMovements) {
    rows.push([
      "Reserve movement",
      movement.note ?? movement.kind,
      movement.date,
      paiseToRupeeString(movement.amountPaise),
      "",
      "",
    ]);
  }

  return toCsv(["Section", "Who", "Expected", "Paid", "Fair share", "Net"], rows);
}

/** `houseos-money-2026-08.csv` — sortable, and says what it holds. */
export function insightsFilename(view: string, scope: string): string {
  const safeScope = scope.replace(/[^\dA-Za-z-]/g, "");
  return `houseos-${view}-${safeScope}.csv`;
}
