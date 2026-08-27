/**
 * CSV serialisation for the analytics exports (AN-06).
 *
 * Pure: report shapes in, a string out. No database, no framework, no clock.
 *
 * Two rules are load-bearing and easy to get wrong:
 *
 * 1. RFC 4180 quoting with CRLF line endings, because a spreadsheet is the
 *    only consumer that matters and Excel is the strictest of them.
 * 2. Formula-injection guarding. A category called `=cmd|' /c calc'!A0` is a
 *    valid category name and an executable formula the moment the file is
 *    opened. Any field that begins with a formula trigger is prefixed with an
 *    apostrophe, which spreadsheets strip on display and treat as text. Money
 *    and counts are exempt when they are plainly numeric, so a negative net
 *    position still reads as a number.
 */

import { paiseToRupeeString } from "@/lib/utils/money";
import type { DailyCostSummary } from "./daily-cost";
import type {
  EffortConcentrationReport,
  MemberPositionReport,
  SpendReport,
} from "./report";

/** Excel only detects UTF-8 from the byte-order mark, and names are not ASCII. */
export const UTF8_BOM = "\uFEFF";

export const EXPORT_TYPES = ["expenses", "spend", "members", "effort", "budgets"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export type CsvValue = string | number | null | undefined;

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Escapes one field: injection guard first, then RFC 4180 quoting. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "number" ? String(value) : value;

  const guarded =
    FORMULA_TRIGGER.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;

  const needsQuotes =
    /[",\r\n]/.test(guarded) || guarded !== guarded.trim() || guarded.startsWith("'");

  return needsQuotes ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** Header plus rows as one CRLF-terminated document. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n")
    .concat("\r\n");
}

export interface ExpenseLedgerRow {
  date: string;
  description: string;
  categoryName: string;
  paidBy: string;
  amountPaise: number;
  status: string;
  splitMethod: string;
  approvedAt: string | null;
}

/** The raw ledger: one line per expense, the shape a spreadsheet pivots. */
export function expensesCsv(rows: ExpenseLedgerRow[]): string {
  return toCsv(
    ["Date", "Description", "Category", "Paid by", "Amount", "Status", "Split", "Approved at"],
    rows.map((row) => [
      row.date,
      row.description,
      row.categoryName,
      row.paidBy,
      paiseToRupeeString(row.amountPaise),
      row.status,
      row.splitMethod,
      row.approvedAt ?? "",
    ]),
  );
}

/** Category by month, with the house total as its own row — the spending tab. */
export function spendCsv(report: SpendReport): string {
  const rows: CsvValue[][] = report.categories.map((category) => [
    category.name,
    ...category.totals.map(paiseToRupeeString),
  ]);
  rows.push(["All categories", ...report.totals.map(paiseToRupeeString)]);
  return toCsv(["Category", ...report.months], rows);
}

/** Paid versus fair share for one month — the people tab. */
export function membersCsv(report: MemberPositionReport): string {
  const rows: CsvValue[][] = report.members.map((member) => [
    report.period,
    member.displayName,
    paiseToRupeeString(member.paidPaise),
    paiseToRupeeString(member.fairSharePaise),
    paiseToRupeeString(member.netPaise),
  ]);
  rows.push([
    report.period,
    "House total",
    paiseToRupeeString(report.totalPaidPaise),
    paiseToRupeeString(report.totalFairSharePaise),
    paiseToRupeeString(report.totalPaidPaise - report.totalFairSharePaise),
  ]);
  return toCsv(["Period", "Member", "Paid", "Fair share", "Net"], rows);
}

/**
 * The top-three concentration ratio over time — the BRD's headline metric, and
 * the one number the house is most likely to want outside the app.
 */
export function effortCsv(report: EffortConcentrationReport): string {
  return toCsv(
    ["Month", "Total points", "Top three points", "Concentration %"],
    report.history.map((row) => [
      row.month,
      row.totalEarnedPoints,
      row.topThreeEarnedPoints,
      (row.concentrationRatio * 100).toFixed(1),
    ]),
  );
}

/** Budget status per category for one month — the budgets tab. */
export function budgetsCsv(summary: DailyCostSummary & { period: string }): string {
  return toCsv(
    ["Period", "Category", "Spent", "Budget", "Used %", "Over budget"],
    summary.categories.map((category) => [
      summary.period,
      category.name,
      paiseToRupeeString(category.spentPaise),
      category.budgetPaise === null ? "" : paiseToRupeeString(category.budgetPaise),
      category.fractionUsed === null ? "" : (category.fractionUsed * 100).toFixed(1),
      category.budgetPaise === null ? "" : category.over ? "yes" : "no",
    ]),
  );
}

/** `houseos-expenses-2026-08.csv` — sortable, and says what it holds. */
export function exportFilename(type: ExportType, scope: string): string {
  const safeScope = scope.replace(/[^\dA-Za-z-]/g, "");
  return `houseos-${type}-${safeScope}.csv`;
}
