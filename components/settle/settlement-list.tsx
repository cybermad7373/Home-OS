"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { List, Section } from "@/components/layout/section";
import { Readout } from "@/components/ui/readout";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils/money";
import { monthLabel } from "@/components/expenses/expense-list";

export interface SettlementItem {
  id: string;
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountPaise: number;
  status: "pending" | "marked_paid" | "confirmed";
  upiLink: string | null;
  isDelta: boolean;
}

/**
 * S-22 — settle.
 *
 * Two perspectives on the same rows: what the caller owes, with a UPI link that
 * opens their payment app, and what the caller is owed, with a confirm button.
 * The app never decides a payment happened — the payer asserts, the receiver
 * confirms, and only then is the month final.
 */
export function SettlementList({
  settlements,
  period,
  currency,
  myMemberId,
  periodStatus,
}: {
  settlements: SettlementItem[];
  period: string;
  currency: string;
  myMemberId: string;
  periodStatus: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, path: string, body: unknown, success: string) {
    setBusyId(id);
    setError(null);

    const response = await fetch(`/api/settlements/${id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);

    if (!response.ok) {
      setError(payload?.error?.message ?? "That did not work");
      return;
    }

    toast(
      payload.period_locked
        ? `${monthLabel(period)} is fully settled and locked.`
        : success,
      "success",
    );
    router.refresh();
  }

  if (settlements.length === 0) {
    return (
      <EmptyState
        title={
          periodStatus === "open"
            ? `${monthLabel(period)} is still open`
            : "No payments needed"
        }
        body={
          periodStatus === "open"
            ? "Payments appear here once an admin closes the month."
            : "Everybody came out square. Nothing to pay."
        }
      />
    );
  }

  const iOwe = settlements.filter((row) => row.fromMemberId === myMemberId);
  const owedToMe = settlements.filter((row) => row.toMemberId === myMemberId);
  const others = settlements.filter(
    (row) => row.fromMemberId !== myMemberId && row.toMemberId !== myMemberId,
  );

  const confirmed = settlements.filter((row) => row.status === "confirmed").length;

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <p className="eyebrow-text mb-3">Payments confirmed</p>
        <div className="flex items-baseline gap-2">
          <Readout value={String(confirmed)} size="lg" />
          <span className="readout text-[18px] leading-none text-text-subtle">
            /{settlements.length}
          </span>
        </div>
        <div
          className="mt-4 h-[3px] bg-surface-3"
          role="progressbar"
          aria-valuenow={confirmed}
          aria-valuemin={0}
          aria-valuemax={settlements.length}
        >
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${(confirmed / settlements.length) * 100}%` }}
          />
        </div>
        <CardDescription className="mt-3">
          {monthLabel(period)} locks when every payment is confirmed by whoever received it.
        </CardDescription>
      </Card>

      {iOwe.length > 0 ? (
        <Section label="You owe">
          <div className="flex flex-col gap-2">
            {iOwe.map((settlement) => (
              <Card key={settlement.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Pay {settlement.toName}</p>
                    {settlement.isDelta ? (
                      <Badge>Adjustment after a reopen</Badge>
                    ) : null}
                  </div>
                  <Readout
                    value={formatMoney(settlement.amountPaise, { currency })}
                    size="md"
                    className="text-danger"
                  />
                </div>

                {settlement.status === "confirmed" ? (
                  <Badge tone="success">Confirmed by {settlement.toName}</Badge>
                ) : (
                  <div className="flex flex-col gap-2">
                    {settlement.upiLink ? (
                      <a href={settlement.upiLink} className="block">
                        <Button block>Pay with UPI</Button>
                      </a>
                    ) : (
                      <p className="caption-text text-text-muted">
                        {settlement.toName} has not added a UPI ID, so pay them however
                        you usually do.
                      </p>
                    )}

                    {settlement.status === "marked_paid" ? (
                      <Button
                        variant="outline"
                        block
                        loading={busyId === settlement.id}
                        onClick={() =>
                          act(settlement.id, "mark-paid", { paid: false }, "Marked unpaid.")
                        }
                      >
                        Waiting for {settlement.toName} — undo
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        block
                        loading={busyId === settlement.id}
                        onClick={() =>
                          act(settlement.id, "mark-paid", { paid: true }, "Marked paid.")
                        }
                      >
                        I have paid
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {owedToMe.length > 0 ? (
        <Section label="You are owed">
          <div className="flex flex-col gap-2">
            {owedToMe.map((settlement) => (
              <Card key={settlement.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="font-medium">{settlement.fromName} pays you</p>
                  <Readout
                    value={formatMoney(settlement.amountPaise, { currency })}
                    size="md"
                    className="text-success"
                  />
                </div>

                {settlement.status === "confirmed" ? (
                  <Badge tone="success">Confirmed</Badge>
                ) : (
                  <Button
                    block
                    loading={busyId === settlement.id}
                    disabled={settlement.status !== "marked_paid"}
                    onClick={() => act(settlement.id, "confirm", {}, "Confirmed received.")}
                  >
                    {settlement.status === "marked_paid"
                      ? "Confirm I received it"
                      : `Waiting for ${settlement.fromName} to pay`}
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {others.length > 0 ? (
        <Section label="Everybody else">
          <List>
              {others.map((settlement) => (
                <li
                  key={settlement.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="caption-text">
                    {settlement.fromName} → {settlement.toName}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular">
                      {formatMoney(settlement.amountPaise, { currency })}
                    </span>
                    <Badge
                      tone={
                        settlement.status === "confirmed"
                          ? "success"
                          : settlement.status === "marked_paid"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {settlement.status === "confirmed"
                        ? "Confirmed"
                        : settlement.status === "marked_paid"
                          ? "Marked paid"
                          : "Pending"}
                    </Badge>
                  </span>
                </li>
            ))}
          </List>
        </Section>
      ) : null}
    </div>
  );
}
