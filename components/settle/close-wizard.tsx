"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatMoney, rupeesToPaise } from "@/lib/utils/money";
import { monthLabel } from "@/components/expenses/expense-list";

interface Balance {
  member_id: string;
  paid: string;
  fair_share: string;
  penalty_owed: string;
  penalty_credit: string;
  final_net: string;
  final_net_paise: number;
}

interface Preview {
  can_close: boolean;
  blockers: string[];
  balances: Balance[];
  settlements: {
    from: string;
    to: string;
    amount: string;
    amount_paise: number;
    upi_link: string | null;
  }[];
  checks: {
    nets_to_zero: boolean;
    transfer_count: number;
    max_possible: number;
    reconciles: boolean;
  };
}

const STEPS = ["Review", "Penalties", "Balances", "Confirm"] as const;

/**
 * S-21 — the close wizard.
 *
 * Four steps, because closing a month is irreversible in practice and must not
 * be a single accidental tap. Nothing is written until the last one.
 */
export function CloseWizard({
  period,
  currency,
  names,
  isAdmin,
  penaltyRatePaise,
}: {
  period: string;
  currency: string;
  names: Record<string, string>;
  isAdmin: boolean;
  penaltyRatePaise: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [shadow, setShadow] = useState(penaltyRatePaise > 0);
  // Keyed by the request it answers, so a stale preview is never shown for the
  // wrong month or the wrong shadow setting — derived, not reset in an effect.
  const [loaded, setLoaded] = useState<{ key: string; preview: Preview } | null>(null);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestKey = `${period}:${shadow}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(
        `/api/periods/${period}/close${shadow ? "?shadow=1" : ""}`,
      );
      if (cancelled) return;
      if (!response.ok) {
        setError("The close preview could not be loaded");
        return;
      }
      setLoaded({ key: `${period}:${shadow}`, preview: await response.json() });
    })();
    return () => {
      cancelled = true;
    };
  }, [period, shadow]);

  const preview = loaded?.key === requestKey ? loaded.preview : null;

  async function close() {
    setClosing(true);
    setError(null);

    const response = await fetch(`/api/periods/${period}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shadow_mode: shadow }),
    });
    const body = await response.json().catch(() => ({}));
    setClosing(false);

    if (!response.ok) {
      const blockers = body?.error?.details?.blockers as string[] | undefined;
      setError(blockers?.join(". ") ?? body?.error?.message ?? "The close did not go through");
      return;
    }

    toast(
      `${monthLabel(period)} closed. ${body.settlements.length} ${
        body.settlements.length === 1 ? "payment" : "payments"
      } created.`,
      "success",
    );
    router.push("/settle");
    router.refresh();
  }

  if (error && !preview) {
    return <Alert tone="danger">{error}</Alert>;
  }

  if (!preview) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const name = (id: string) => names[id] ?? "Someone";

  return (
    <div className="flex flex-col gap-3">
      <ol className="mb-1 flex items-center gap-2 text-[12px]">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={
              index === step
                ? "rounded-full bg-primary px-2.5 py-1 text-primary-fg"
                : index < step
                  ? "text-primary"
                  : "text-text-subtle"
            }
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {step === 0 ? (
        <Card>
          <CardTitle>Review {monthLabel(period)}</CardTitle>
          <CardDescription>
            {preview.balances.length} people ·{" "}
            {formatMoney(
              preview.balances.reduce(
                (sum, balance) => sum + rupeesToPaise(balance.paid),
                0,
              ),
              { currency },
            )}{" "}
            spent
          </CardDescription>

          {preview.blockers.length > 0 ? (
            <div className="mt-3">
              <Alert tone="warning" title="This month cannot close yet">
                <ul className="mt-1 list-disc pl-4">
                  {preview.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : (
            <div className="mt-3">
              <Alert tone="success">Nothing is blocking the close.</Alert>
            </div>
          )}
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardTitle>Effort penalties</CardTitle>
          <CardDescription>
            The chore engine is not switched on yet, so nobody has an effort deficit and
            every penalty is zero. Once it is, this step shows who owes what and why.
          </CardDescription>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="label-text">Shadow mode</p>
              <p className="caption-text text-text-muted">
                Compute and show the penalties without charging anybody. Worth running for
                the first month, so the first real charge is something the house agreed to
                rather than something the app did to them.
              </p>
            </div>
            <Button
              size="sm"
              variant={shadow ? "primary" : "outline"}
              aria-pressed={shadow}
              onClick={() => setShadow((value) => !value)}
            >
              {shadow ? "On" : "Off"}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <>
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-border text-left text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Member</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Share</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.balances.map((balance) => (
                    <tr key={balance.member_id}>
                      <td className="px-3 py-2">{name(balance.member_id)}</td>
                      <td className="tabular px-3 py-2 text-right">
                        {formatMoney(rupeesToPaise(balance.paid), { currency })}
                      </td>
                      <td className="tabular px-3 py-2 text-right">
                        {formatMoney(rupeesToPaise(balance.fair_share), { currency })}
                      </td>
                      <td
                        className={
                          balance.final_net_paise >= 0
                            ? "tabular px-3 py-2 text-right text-success"
                            : "tabular px-3 py-2 text-right text-danger"
                        }
                      >
                        {formatMoney(balance.final_net_paise, { currency })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Alert tone={preview.checks.nets_to_zero ? "success" : "danger"}>
            {preview.checks.nets_to_zero
              ? "Balances net to zero."
              : "Balances do NOT net to zero. This is a defect and closing is blocked."}
          </Alert>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card>
            <CardTitle>
              {preview.settlements.length}{" "}
              {preview.settlements.length === 1 ? "payment" : "payments"}
            </CardTitle>
            <CardDescription>
              At most {preview.checks.max_possible} were possible for this many people.
              Everybody is notified when you close.
            </CardDescription>

            <ul className="mt-3 divide-y divide-border">
              {preview.settlements.map((settlement, index) => (
                <li
                  key={`${settlement.from}-${settlement.to}-${index}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span>
                    {settlement.from} → {settlement.to}
                  </span>
                  <span className="tabular font-medium">
                    {formatMoney(settlement.amount_paise, { currency })}
                  </span>
                </li>
              ))}
            </ul>

            {preview.settlements.length === 0 ? (
              <p className="caption-text mt-3 text-text-muted">
                Nobody owes anybody. The month closes with no payments.
              </p>
            ) : null}
          </Card>

          {shadow ? (
            <Alert tone="info">
              Shadow mode is on: penalties are shown but nobody is charged.
            </Alert>
          ) : null}
        </>
      ) : null}

      <div className="mt-2 flex gap-2">
        {step > 0 ? (
          <Button variant="outline" block onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : null}

        {step < STEPS.length - 1 ? (
          <Button block onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button
            block
            loading={closing}
            disabled={!preview.can_close || !isAdmin}
            onClick={close}
          >
            {isAdmin ? `Close ${monthLabel(period)}` : "Only an admin can close"}
          </Button>
        )}
      </div>

      {!preview.checks.reconciles ? (
        <Badge tone="danger">
          The payment list does not reconcile with the balances — this is a defect
        </Badge>
      ) : null}
    </div>
  );
}
