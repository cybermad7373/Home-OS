"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { Readout } from "@/components/ui/readout";
import { Skeleton } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { Columns } from "@/components/layout/columns";
import { List, Section } from "@/components/layout/section";
import { formatMoney, rupeesToPaise } from "@/lib/utils/money";
import { monthLabel } from "@/lib/utils/period";
import { cn } from "@/lib/utils/cn";

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
 *
 * Redrawn for 3.0. The four steps were four pills of equal weight, so the one
 * you were on shouted no louder than the three you were not; the balances were
 * a hand-rolled table that scrolled the page sideways on a phone; and the
 * control that actually closes the month sat at the bottom of whichever step
 * you had scrolled to. The steps are a rule with the current one filled, the
 * balances go through `DataList`, and the close button lives in the rail with
 * the figure it is about to move.
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

  const movingPaise = preview.settlements.reduce(
    (sum, settlement) => sum + settlement.amount_paise,
    0,
  );

  return (
    <Columns
      main={
        <>
          {/*
            The steps are a rule with the current one filled rather than four
            pills of equal weight: at any moment three of the four are not where
            you are. `aria-current` carries the same fact to a screen reader.
          */}
          <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            {STEPS.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
                className={cn(
                  "eyebrow-text flex items-center gap-1.5",
                  index === step ? "text-text" : "text-text-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-px w-5", index <= step ? "bg-text" : "bg-border-strong")}
                />
                {index + 1}. {label}
              </li>
            ))}
          </ol>

          {error ? (
            <Alert tone="danger" className="mb-4">
              {error}
            </Alert>
          ) : null}

          {step === 0 ? (
            <Section label={`Review ${monthLabel(period)}`} className="mt-0">
              <p className="caption-text mb-3 text-text-muted">
                {preview.balances.length} people ·{" "}
                {formatMoney(
                  preview.balances.reduce(
                    (sum, balance) => sum + rupeesToPaise(balance.paid),
                    0,
                  ),
                  { currency },
                )}{" "}
                spent
              </p>

              {preview.blockers.length > 0 ? (
                <Alert tone="warning" title="This month cannot close yet">
                  <ul className="mt-1 list-disc pl-4">
                    {preview.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <Alert tone="success">Nothing is blocking the close.</Alert>
              )}
            </Section>
          ) : null}

          {step === 1 ? (
            <Section label="Effort penalties" className="mt-0">
              <List>
                <SwitchRow
                  label="Shadow mode"
                  help="Compute and show the penalties without charging anybody. Worth running for the first month, so the first real charge is something the house agreed to rather than something the app did to them."
                  checked={shadow}
                  onChange={setShadow}
                />
              </List>
              <p className="caption-text mt-3 text-text-muted">
                Penalties come from this month&rsquo;s effort ledger. Where nobody is in
                deficit every figure is zero and this step is a formality.
              </p>
            </Section>
          ) : null}

          {step === 2 ? (
            <Section label="Where everybody stands" className="mt-0">
              <DataList
                rows={preview.balances}
                rowKey={(balance) => balance.member_id}
                columns={[
                  {
                    key: "member",
                    header: "Member",
                    priority: "primary",
                    render: (balance) => (
                      <span className="font-medium">{name(balance.member_id)}</span>
                    ),
                  },
                  {
                    key: "paid",
                    header: "Paid",
                    render: (balance) =>
                      formatMoney(rupeesToPaise(balance.paid), { currency }),
                  },
                  {
                    key: "share",
                    header: "Share",
                    render: (balance) =>
                      formatMoney(rupeesToPaise(balance.fair_share), { currency }),
                  },
                  {
                    key: "net",
                    header: "Net",
                    numeric: true,
                    render: (balance) => (
                      <span
                        className={
                          balance.final_net_paise >= 0 ? "text-success" : "text-danger"
                        }
                      >
                        {formatMoney(balance.final_net_paise, { currency })}
                      </span>
                    ),
                  },
                ]}
              />

              <Alert
                className="mt-3"
                tone={preview.checks.nets_to_zero ? "success" : "danger"}
              >
                {preview.checks.nets_to_zero
                  ? "Balances net to zero."
                  : "Balances do NOT net to zero. This is a defect and closing is blocked."}
              </Alert>
            </Section>
          ) : null}

          {step === 3 ? (
            <Section
              label={`${preview.settlements.length} ${
                preview.settlements.length === 1 ? "payment" : "payments"
              }`}
              className="mt-0"
            >
              <p className="caption-text mb-3 text-text-muted">
                At most {preview.checks.max_possible} were possible for this many people.
                Everybody is notified when you close.
              </p>

              {preview.settlements.length === 0 ? (
                <p className="text-text-muted">
                  Nobody owes anybody. The month closes with no payments.
                </p>
              ) : (
                <List>
                  {preview.settlements.map((settlement, index) => (
                    <li
                      key={`${settlement.from}-${settlement.to}-${index}`}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <span>
                        {settlement.from} → {settlement.to}
                      </span>
                      <span className="tabular font-medium">
                        {formatMoney(settlement.amount_paise, { currency })}
                      </span>
                    </li>
                  ))}
                </List>
              )}

              {shadow ? (
                <Alert tone="info" className="mt-3">
                  Shadow mode is on: penalties are shown but nobody is charged.
                </Alert>
              ) : null}
            </Section>
          ) : null}
        </>
      }
      aside={
        <Section label="This close" className="mt-0">
          <Readout value={formatMoney(movingPaise, { currency })} size="lg" />
          <p className="caption-text mt-2 text-text-muted">
            moves between {preview.balances.length} people, in{" "}
            {preview.settlements.length}{" "}
            {preview.settlements.length === 1 ? "payment" : "payments"}. Nothing is
            written until the last step.
          </p>

          <div className="mt-4 flex gap-2">
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
            <Alert tone="danger" className="mt-3">
              The payment list does not reconcile with the balances — this is a defect.
            </Alert>
          ) : null}
        </Section>
      }
    />
  );
}
