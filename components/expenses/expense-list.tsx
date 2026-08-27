"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberAvatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/input";
import { AddExpenseSheet } from "./add-expense-sheet";
import { NlQuickAdd, type ExpensePrefill } from "./nl-quick-add";
import { ExpenseFilters } from "./expense-filters";
import { ExpenseDetailSheet } from "./expense-detail-sheet";
import { formatDate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
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

  return (
    <>
      {aiEnabled ? (
        <NlQuickAdd
          onExpense={(proposal) => {
            setPrefill(proposal);
            setAdding(true);
          }}
        />
      ) : null}

      <Card className="mb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-text text-text-muted">House spent</p>
            <p className="display-number">
              {formatMoney(totals.totalPaise, { currency })}
            </p>
          </div>
          <div className="text-right">
            <p className="label-text text-text-muted">
              {yourNetPaise >= 0 ? "You are owed" : "You owe"}
            </p>
            <p
              className={
                yourNetPaise >= 0
                  ? "display-number text-success"
                  : "display-number text-danger"
              }
            >
              {formatMoney(Math.abs(yourNetPaise), { currency })}
            </p>
          </div>
        </div>
        <p className="caption-text mt-2 text-text-muted">
          You paid {formatMoney(totals.yourPaidPaise, { currency })} · your share{" "}
          {formatMoney(totals.yourSharePaise, { currency })}
        </p>
      </Card>

      <div className="mb-3 flex items-center gap-2">
        <Select
          aria-label="Month"
          value={period}
          className="h-9 w-auto text-[13px]"
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
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          Add expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          title="Nothing logged this month"
          body="Log the first one and the house stops keeping this on paper. It takes about ten seconds."
          action={<Button size="sm" onClick={() => setAdding(true)}>Add an expense</Button>}
        />
      ) : null}

      {byDate.map(([date, items]) => (
        <section key={date} className="mb-4">
          <h2 className="label-text mb-2 text-text-muted">
            {formatDate(date, timezone, { weekday: "short", day: "numeric", month: "short" })}
          </h2>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {items.map((expense) => (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => setOpenExpenseId(expense.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                  >
                    <span aria-hidden className="text-[20px]">
                      {expense.category.icon ?? "📦"}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {expense.description || expense.category.name}
                        </span>
                        {expense.status === "pending_approval" ? (
                          <Badge tone="warning">Needs approval</Badge>
                        ) : null}
                        {expense.isAdjustment && expense.adjustmentForPeriod ? (
                          <Badge tone="info">
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
            </ul>
          </Card>
        </section>
      ))}

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

function groupByDate(expenses: ExpenseListItem[]): [string, ExpenseListItem[]][] {
  const groups = new Map<string, ExpenseListItem[]>();
  for (const expense of expenses) {
    const list = groups.get(expense.expenseDate) ?? [];
    list.push(expense);
    groups.set(expense.expenseDate, list);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
