"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";

interface ExpenseDetail {
  id: string;
  amountPaise: number;
  description: string | null;
  expenseDate: string;
  splitBasis: string;
  status: "pending_approval" | "approved" | "rejected" | "void";
  receiptUrl: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  category: { id: string; name: string; icon: string | null };
  paidBy: { memberId: string; displayName: string };
  approvedBy: { memberId: string; displayName: string } | null;
  period: string;
  yourSharePaise: number;
  splits: {
    memberId: string;
    displayName: string;
    sharePaise: number;
    guestSharePaise: number;
  }[];
}

/**
 * S-18 — the expense detail sheet.
 *
 * The whole split is shown, per member. Somebody who thinks their share is
 * wrong can see every other share on the same screen, which is the difference
 * between a disagreement and an argument.
 */
export function ExpenseDetailSheet({
  expenseId,
  onClose,
  currency,
  timezone,
  myMemberId,
  isAdmin,
}: {
  expenseId: string;
  onClose: () => void;
  currency: string;
  timezone: string;
  myMemberId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/expenses/${expenseId}`);
      if (cancelled) return;
      if (!response.ok) {
        setError("That expense could not be loaded");
        return;
      }
      const detail: ExpenseDetail = await response.json();
      setExpense(detail);

      if (detail.receiptUrl) {
        const signed = await fetch(
          `/api/receipts?path=${encodeURIComponent(detail.receiptUrl)}`,
        );
        if (!cancelled && signed.ok) setReceiptUrl((await signed.json()).url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  async function act(path: string, body: unknown, success: string) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/expenses/${expenseId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return;
    }

    toast(success, "success");
    onClose();
    router.refresh();
  }

  if (error && !expense) {
    return (
      <BottomSheet open onClose={onClose} title="Expense">
        <Alert tone="danger">{error}</Alert>
      </BottomSheet>
    );
  }

  if (!expense) {
    return (
      <BottomSheet open onClose={onClose} title="Expense">
        <Skeleton className="mb-3 h-10 w-40" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-32 w-full" />
      </BottomSheet>
    );
  }

  const isPayer = expense.paidBy.memberId === myMemberId;
  const canVoid = (isPayer || isAdmin) && expense.status !== "void";

  return (
    <BottomSheet open onClose={onClose} title={expense.description || expense.category.name}>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <p className="display-number">{formatMoney(expense.amountPaise, { currency })}</p>
      <p className="caption-text mb-4 text-text-muted">
        {expense.category.icon ? `${expense.category.icon} ` : ""}
        {expense.category.name} ·{" "}
        {formatDate(expense.expenseDate, timezone, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}{" "}
        · paid by {isPayer ? "you" : expense.paidBy.displayName}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {expense.status === "pending_approval" ? (
          <Badge tone="warning">Waiting for approval</Badge>
        ) : null}
        {expense.status === "approved" ? <Badge tone="success">Approved</Badge> : null}
        {expense.status === "rejected" ? <Badge tone="danger">Rejected</Badge> : null}
        {expense.status === "void" ? <Badge tone="neutral">Void</Badge> : null}
      </div>

      {expense.rejectionReason ? (
        <div className="mb-4">
          <Alert tone="warning" title="Reason">
            {expense.rejectionReason}
          </Alert>
        </div>
      ) : null}

      {receiptUrl ? (
        <a
          href={receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="caption-text mb-4 block text-primary"
        >
          Open the receipt
        </a>
      ) : null}

      <h3 className="heading-text mb-2">The split</h3>
      <ul className="mb-4 divide-y divide-border rounded-[10px] border border-border">
        {expense.splits.map((split) => (
          <li
            key={split.memberId}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <span className={split.memberId === myMemberId ? "font-medium" : undefined}>
              {split.displayName}
              {split.memberId === myMemberId ? " · you" : ""}
            </span>
            <span className="text-right">
              <span className="tabular block">
                {formatMoney(split.sharePaise + split.guestSharePaise, { currency })}
              </span>
              {split.guestSharePaise > 0 ? (
                <span className="caption-text block text-text-muted">
                  includes {formatMoney(split.guestSharePaise, { currency })} for a guest
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <p className="caption-text mb-4 text-text-subtle">
        Logged {formatDateTime(expense.createdAt, timezone)}
        {expense.approvedBy && expense.approvedAt
          ? ` · approved by ${expense.approvedBy.displayName} ${formatDateTime(expense.approvedAt, timezone)}`
          : ""}
      </p>

      {/* BR-085: the payer never sees approve buttons on their own expense. */}
      {expense.status === "pending_approval" && !isPayer ? (
        <div className="mb-2 flex gap-2">
          <Button
            variant="outline"
            block
            loading={busy}
            onClick={() =>
              act("approve", { approve: false, reason: "Rejected from the detail view" },
                "Rejected.")
            }
          >
            Reject
          </Button>
          <Button
            block
            loading={busy}
            onClick={() => act("approve", { approve: true }, "Approved.")}
          >
            Approve
          </Button>
        </div>
      ) : null}

      {expense.status === "pending_approval" && isPayer ? (
        <Alert tone="info">
          Somebody else in the house has to approve this before it counts.
        </Alert>
      ) : null}

      {canVoid ? (
        voiding ? (
          <div className="mt-3 rounded-[10px] bg-danger-bg p-3">
            <p className="caption-text mb-2 text-danger">
              Voiding keeps the record and its reason, and takes it out of every balance.
            </p>
            <Input
              aria-label="Reason"
              value={reason}
              placeholder="Why?"
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setVoiding(false)}>
                Keep it
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={busy}
                disabled={reason.trim().length < 3}
                onClick={() => act("void", { reason }, "Voided.")}
              >
                Void it
              </Button>
            </div>
          </div>
        ) : (
          <Button
            block
            variant="ghost"
            className="mt-2 text-danger"
            onClick={() => setVoiding(true)}
          >
            Void this expense
          </Button>
        )
      ) : null}
    </BottomSheet>
  );
}
