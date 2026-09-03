"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Columns } from "@/components/layout/columns";
import { List, Section } from "@/components/layout/section";
import { Readout } from "@/components/ui/readout";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberAvatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/input";
import { AddExpenseSheet } from "./add-expense-sheet";
import { NlQuickAdd, type ExpensePrefill } from "./nl-quick-add";
import { ExpenseFilters } from "./expense-filters";
import { ExpenseDetailSheet } from "./expense-detail-sheet";
import { formatDate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { monthLabel } from "@/lib/utils/period";
import type { ExpenseCategoryRow, MoneyMode } from "@/lib/types/database";
import type { MemberView } from "@/lib/types/domain";

export interface ExpenseListItem {
  id: string;
  amountPaise: number;
  description: string | null;
  expenseDate: string;
  status: "pending_approval" | "approved" | "rejected" | "void";
  isAdjustment: boolean;
  adjustmentForPeriod: string | null;
  category: { id: string; name: string; icon: string | null };
  paidBy: { memberId: string; displayName: string; avatarUrl: string | null };
  yourSharePaise: number;
}

/**
 * S-16 — the expense list.
 *
 * Grouped by date, newest first, with the caller's own share under each row.
 * The sticky header carries the month total and their position in it, because
 * "what has the house spent" and "where do I stand" are the two questions this
 * screen exists to answer.
 */
export function ExpenseList({
  expenses,
  totals,
  categories,
  members,
  me,
  houseId,
  currency,
  timezone,
  today,
  approvalThresholdPaise,
  moneyMode,
  period,
  periods,
  openAddOnMount = false,
  aiEnabled = false,
}: {
  expenses: ExpenseListItem[];
  totals: { totalPaise: number; yourSharePaise: number; yourPaidPaise: number };
  categories: ExpenseCategoryRow[];
  members: MemberView[];
  me: MemberView;
  houseId: string;
  currency: string;
  timezone: string;
  today: string;
  approvalThresholdPaise: number;
  moneyMode: MoneyMode;
  period: string;
  periods: string[];
  openAddOnMount?: boolean;
  /** Whether this house has an AI key — the quick-add field needs one. */
  aiEnabled?: boolean;
}) {
  const [adding, setAdding] = useState(openAddOnMount);
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<ExpensePrefill | null>(null);

  const byDate = groupByDate(expenses);
  const yourNetPaise = totals.yourPaidPaise - totals.yourSharePaise;

  /*
   * The ledger is what this screen is about, so the ledger is the main column
   * and everything that describes or filters it sits in the rail: the two
   * figures, the month, the filters, and the control that adds a row.
   *
   * On a phone they stack in the old order — figures, toolbar, list — because
   * on a phone the figures are the first thing worth seeing and the list is a
   * scroll away regardless.
   */
  const summary = (
    <>
      {/* The two questions this screen exists to answer, as the only two
          numbers on it set in the display face. */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border lg:grid-cols-1">
        <div className="bg-surface p-4">
          <p className="eyebrow-text mb-3">House spent</p>
          <Readout
            value={formatMoney(totals.totalPaise, { currency })}
            size="lg"
          />
          <p className="caption-text mt-2 text-text-muted">
            you paid{" "}
            <span className="tabular">
              {formatMoney(totals.yourPaidPaise, { currency })}
            </span>
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="eyebrow-text mb-3">
            {yourNetPaise === 0
              ? "Your position"
              : yourNetPaise > 0
                ? "You are owed"
                : "You owe"}
          </p>
          <Readout
            value={formatMoney(Math.abs(yourNetPaise), { currency })}
            size="lg"
            className={
              yourNetPaise === 0
                ? "text-text"
                : yourNetPaise > 0
                  ? "text-success"
                  : "text-danger"
            }
          />
          <p className="caption-text mt-2 text-text-muted">
            your share{" "}
            <span className="tabular">
              {formatMoney(totals.yourSharePaise, { currency })}
            </span>
          </p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Select
          aria-label="Month"
          value={period}
          className="h-9 min-w-0 flex-1 text-[13px] sm:w-auto sm:flex-none"
          onChange={(event) => {
            window.location.search = `?period=${event.target.value}`;
          }}
        >
          {periods.map((value) => (
            <option key={value} value={value}>
              {monthLabel(value)}
            </option>
          ))}
        </Select>
        <ExpenseFilters categories={categories} members={members} />
        <Button
          className="ml-auto whitespace-nowrap"
          onClick={() => setAdding(true)}
        >
          Add
        </Button>
      </div>
    </>
  );

  const ledger = (
    <>
      {aiEnabled ? (
        <NlQuickAdd
          onExpense={(proposal) => {
            setPrefill(proposal);
            setAdding(true);
          }}
        />
      ) : null}

      {expenses.length === 0 ? (
        <EmptyState
          title="Nothing logged this month"
          body="Log the first one and the house stops keeping this on paper. It takes about ten seconds."
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              Add an expense
            </Button>
          }
        />
      ) : null}

      {byDate.map(([date, items]) => (
        <Section
          key={date}
          label={formatDate(date, timezone, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        >
          <List>
            {items.map((expense) => (
              <li key={expense.id}>
                <button
                  type="button"
                  onClick={() => setOpenExpenseId(expense.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  {/* The category's mark, in a box. A house that set an
                        emoji keeps it, desaturated — full-colour emoji is the
                        loudest thing on a monochrome screen and it would be
                        the loudest thing on every row. A house that set none
                        gets the first two letters of the category, which is
                        enough to scan a column by. */}
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-border text-[12px] font-medium uppercase text-text-muted"
                  >
                    {expense.category.icon ? (
                      <span className="text-[15px] grayscale">
                        {expense.category.icon}
                      </span>
                    ) : (
                      expense.category.name.slice(0, 2)
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {expense.description || expense.category.name}
                      </span>
                      {expense.status === "pending_approval" ? (
                        <Badge>Needs approval</Badge>
                      ) : null}
                      {expense.isAdjustment && expense.adjustmentForPeriod ? (
                        <Badge>
                          for {monthLabel(expense.adjustmentForPeriod)}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="caption-text flex items-center gap-1.5 text-text-muted">
                      <MemberAvatar
                        name={expense.paidBy.displayName}
                        avatarUrl={expense.paidBy.avatarUrl}
                        size="sm"
                      />
                      {expense.paidBy.memberId === me.id
                        ? "You paid"
                        : `${expense.paidBy.displayName} paid`}
                    </span>
                  </span>

                  <span className="text-right">
                    <span className="tabular block font-semibold">
                      {formatMoney(expense.amountPaise, { currency })}
                    </span>
                    <span className="caption-text tabular block text-text-muted">
                      you: {formatMoney(expense.yourSharePaise, { currency })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </List>
        </Section>
      ))}
    </>
  );

  return (
    <>
      <Columns main={ledger} aside={summary} asideFirst />

      <AddExpenseSheet
        open={adding}
        onClose={() => {
          setAdding(false);
          setPrefill(null);
        }}
        prefill={prefill}
        categories={categories}
        members={members}
        me={me}
        houseId={houseId}
        currency={currency}
        today={today}
        approvalThresholdPaise={approvalThresholdPaise}
        moneyMode={moneyMode}
      />

      {openExpenseId ? (
        <ExpenseDetailSheet
          expenseId={openExpenseId}
          onClose={() => setOpenExpenseId(null)}
          currency={currency}
          timezone={timezone}
          myMemberId={me.id}
          isAdmin={me.role === "admin"}
        />
      ) : null}
    </>
  );
}

function groupByDate(
  expenses: ExpenseListItem[],
): [string, ExpenseListItem[]][] {
  const groups = new Map<string, ExpenseListItem[]>();
  for (const expense of expenses) {
    const list = groups.get(expense.expenseDate) ?? [];
    list.push(expense);
    groups.set(expense.expenseDate, list);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

