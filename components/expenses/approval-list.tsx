"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Readout } from "@/components/ui/readout";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";

export interface ApprovalItem {
  id: string;
  amountPaise: number;
  description: string | null;
  expenseDate: string;
  category: { name: string; icon: string | null };
  paidBy: { displayName: string; avatarUrl: string | null };
  yourSharePaise: number;
}

/**
 * S-19 — approvals.
 *
 * Each card shows the caller's own resulting share, because "do I approve this
 * ₹4,000" is a different question from "do I approve paying ₹500 of it".
 */
export function ApprovalList({
  expenses,
  currency,
  timezone,
}: {
  expenses: ApprovalItem[];
  currency: string;
  timezone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean, why?: string) {
    setBusyId(id);
    setError(null);

    const response = await fetch(`/api/expenses/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, reason: why }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return;
    }

    setRejecting(null);
    setReason("");
    toast(approve ? "Approved." : "Rejected.", approve ? "success" : "neutral");
    router.refresh();
  }

  if (expenses.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on you"
        body="Expenses above the house threshold appear here until somebody other than the payer approves them."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {expenses.map((expense) => (
        <Card key={expense.id}>
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {expense.description || expense.category.name}
              </p>
              <p className="caption-text flex items-center gap-1.5 text-text-muted">
                <MemberAvatar
                  name={expense.paidBy.displayName}
                  avatarUrl={expense.paidBy.avatarUrl}
                  size="sm"
                />
                {expense.paidBy.displayName} ·{" "}
                {formatDate(expense.expenseDate, timezone)}
              </p>
            </div>
            <Readout value={formatMoney(expense.amountPaise, { currency })} size="md" />
          </div>

          <p className="caption-text mb-3 text-text-muted">
            Your share if this is approved:{" "}
            <span className="tabular font-medium text-text">
              {formatMoney(expense.yourSharePaise, { currency })}
            </span>
          </p>

          {rejecting === expense.id ? (
            <div className="rounded-[10px] bg-surface-2 p-3">
              <Input
                aria-label="Reason for rejecting"
                value={reason}
                placeholder="Why are you rejecting it?"
                onChange={(event) => setReason(event.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busyId === expense.id}
                  disabled={reason.trim().length < 3}
                  onClick={() => decide(expense.id, false, reason)}
                >
                  Reject it
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                block
                onClick={() => {
                  setRejecting(expense.id);
                  setReason("");
                }}
              >
                Reject
              </Button>
              <Button
                block
                loading={busyId === expense.id}
                onClick={() => decide(expense.id, true)}
              >
                Approve
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
