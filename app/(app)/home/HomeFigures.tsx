import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Readout } from "@/components/ui/readout";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

/**
 * The two figures Home exists to show: what you owe the house in effort this
 * week, and where you stand with it in money this month.
 *
 * They are set in the dot-matrix display face at 44px, because they are the
 * only two numbers on the screen a person came to read. Everything else on
 * Home is a list, and a list is not a number.
 *
 * The money figure is the one place colour is spent — green if the house owes
 * you, red if you owe it, ink if you are square. That mapping never inverts.
 * The effort figure is never coloured: being behind on chores is not a
 * financial state, and a red points total on a Monday morning is a scold.
 */

export function HomeFigures({
  earnedThisWeek,
  assignedThisWeek,
  isPot,
  dailyCost,
  yourNetPaise,
  money,
  currency,
}: {
  earnedThisWeek: number;
  assignedThisWeek: number;
  isPot: boolean;
  dailyCost: {
    monthToDatePaise: number;
    averagePerDayPaise: number;
    projectedMonthPaise: number;
  };
  yourNetPaise: number;
  money: { yourPaidPaise: number; yourSharePaise: number };
  currency: string;
}) {
  const remaining = Math.max(0, assignedThisWeek - earnedThisWeek);

  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border sm:grid-cols-2">
      <Panel
        href="/chores/mine"
        eyebrow="Effort · this week"
        footer={
          assignedThisWeek === 0
            ? "Nothing assigned to you yet"
            : remaining === 0
              ? "Week cleared"
              : `${remaining} to go`
        }
      >
        {assignedThisWeek === 0 ? (
          <Readout value="—" size="xl" className="text-text-subtle" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <Readout value={String(earnedThisWeek)} size="xl" />
              <span className="readout text-[20px] leading-none text-text-subtle">
                /{assignedThisWeek}
              </span>
            </div>
            <Meter value={earnedThisWeek} max={assignedThisWeek} />
          </>
        )}
      </Panel>

      {isPot ? (
        <Panel
          href="/money/daily"
          eyebrow="Pot · this month"
          footer={`${formatMoney(dailyCost.averagePerDayPaise, { currency })} a day · heading for ${formatMoney(dailyCost.projectedMonthPaise, { currency })}`}
        >
          <Readout value={formatMoney(dailyCost.monthToDatePaise, { currency })} size="xl" />
          <PaidShare money={money} currency={currency} />
        </Panel>
      ) : (
        <Panel
          href="/settle"
          eyebrow="Balance · this month"
          footer={
            yourNetPaise === 0
              ? "You are square with the house"
              : yourNetPaise > 0
                ? "the house owes you"
                : "you owe the house"
          }
        >
          <Readout
            value={formatMoney(Math.abs(yourNetPaise), { currency })}
            size="xl"
            className={
              yourNetPaise === 0 ? "text-text" : yourNetPaise > 0 ? "text-success" : "text-danger"
            }
          />
          <PaidShare money={money} currency={currency} />
        </Panel>
      )}
    </div>
  );
}

/**
 * The 1px gap between the two panels is the grid's own background showing
 * through, so the divider is the same hairline as every other divider in the
 * app rather than a border that doubles up at the seam.
 */
function Panel({
  href,
  eyebrow,
  footer,
  children,
}: {
  href: string;
  eyebrow: string;
  footer: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[148px] flex-col bg-surface p-4 transition-colors hover:bg-surface-2"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="eyebrow-text">{eyebrow}</span>
        <ArrowUpRight
          size={13}
          className="magnetic-icon shrink-0 text-text-subtle"
          aria-hidden
        />
      </div>
      {children}
      <p className="caption-text mt-auto pt-4 text-text-muted">{footer}</p>
    </Link>
  );
}

function PaidShare({
  money,
  currency,
}: {
  money: { yourPaidPaise: number; yourSharePaise: number };
  currency: string;
}) {
  return (
    <dl className="caption-text mt-3 flex gap-4 text-text-muted">
      <div className="flex gap-1.5">
        <dt>Paid</dt>
        <dd className="tabular text-text">{formatMoney(money.yourPaidPaise, { currency })}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt>Share</dt>
        <dd className="tabular text-text">{formatMoney(money.yourSharePaise, { currency })}</dd>
      </div>
    </dl>
  );
}

/** A 2px rule that fills. No stripes, no gradient, no animation on load. */
export function Meter({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn("mt-4 h-[3px] w-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
