"use client";

import Link from "next/link";
import { Card, CardShell, CardCore, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CountUpMoney, CountUpPoints } from "@/components/motion/NumberCountUp";
import { LinearProgress, StatProgress } from "@/components/ui/progress";
import { SectionReveal } from "@/components/motion/StaggerReveal";
import { formatMoney } from "@/lib/utils/money";

interface HomeHeroCardsProps {
  earnedThisWeek: number;
  assignedThisWeek: number;
  isPot: boolean;
  dailyCost: {
    monthToDatePaise: number;
    averagePerDayPaise: number;
    projectedMonthPaise: number;
  };
  yourNetPaise: number;
  money: {
    yourPaidPaise: number;
    yourSharePaise: number;
  };
  house: { currency: string };
}

export function HomeHeroCards({
  earnedThisWeek,
  assignedThisWeek,
  isPot,
  dailyCost,
  yourNetPaise,
  money,
  house,
}: HomeHeroCardsProps) {
  const progress = assignedThisWeek > 0 ? Math.min(earnedThisWeek / assignedThisWeek, 1) : 0;

  return (
    <section className="mt-6" aria-labelledby="hero-heading">
      <h2 id="hero-heading" className="sr-only">Home overview</h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr] lg:grid-cols-[1.2fr_1fr]">
        {/* This Week Card - Larger, primary */}
        <SectionReveal>
          <Link href="/chores" className="block">
            <CardShell className="h-full group transition-shadow hover:shadow-[var(--shadow-elevated)]">
              <CardCore className="h-full flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <CardTitle>This week</CardTitle>
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-primary/10 text-primary">
                    Effort
                  </span>
                </div>
                {assignedThisWeek === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mb-4 text-text-muted">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                    <p className="display-number text-text-subtle">—</p>
                    <CardDescription className="mt-2 max-w-xs">Nothing assigned to you this week yet.</CardDescription>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2 mb-3">
                      <CountUpPoints points={earnedThisWeek} className="text-text" duration={600} />
                      <span className="text-text-subtle text-[20px] font-medium">/ {assignedThisWeek}</span>
                    </div>
                    <LinearProgress
                      value={earnedThisWeek}
                      max={assignedThisWeek}
                      height={10}
                      variant="primary"
                      striped={progress < 1}
                      animate={true}
                      className="mb-3"
                    />
                    <CardDescription className="mt-auto">
                      {progress >= 1
                        ? "All done! 🎉"
                        : `${Math.max(0, assignedThisWeek - earnedThisWeek)} points to go`}
                    </CardDescription>
                  </>
                )}
              </CardCore>
            </CardShell>
          </Link>
        </SectionReveal>

        {/* This Month Card - Secondary, contextual */}
        <SectionReveal delay={0.1}>
          {isPot ? (
            <Link href="/money/daily" className="block">
              <CardShell className="h-full group transition-shadow hover:shadow-[var(--shadow-elevated)]">
                <CardCore className="h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <CardTitle>This month</CardTitle>
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-info/10 text-info">
                      Pot
                    </span>
                  </div>
                  <CountUpMoney
                    paise={dailyCost.monthToDatePaise}
                    currency={house.currency}
                    className="text-text"
                    duration={600}
                  />
                  <CardDescription className="mt-2">
                    {formatMoney(dailyCost.averagePerDayPaise, { currency: house.currency })} / day · on track for{" "}
                    {formatMoney(dailyCost.projectedMonthPaise, { currency: house.currency })}
                  </CardDescription>
                  <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-[13px] text-text-muted">
                    <span>Paid: {formatMoney(money.yourPaidPaise, { currency: house.currency })}</span>
                    <span>Share: {formatMoney(money.yourSharePaise, { currency: house.currency })}</span>
                  </div>
                </CardCore>
              </CardShell>
            </Link>
          ) : (
            <Link href="/settle" className="block">
              <CardShell className="h-full group transition-shadow hover:shadow-[var(--shadow-elevated)]">
                <CardCore className="h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <CardTitle>This month</CardTitle>
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-warning/10 text-warning">
                      Split
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <CountUpMoney
                      paise={Math.abs(yourNetPaise)}
                      currency={house.currency}
                      className={
                        yourNetPaise === 0
                          ? "text-text"
                          : yourNetPaise > 0
                          ? "text-success"
                          : "text-danger"
                      }
                      duration={600}
                    />
                    <CardDescription className="mt-2">
                      {yourNetPaise === 0
                        ? "You are square with the house"
                        : yourNetPaise > 0
                        ? "the house owes you"
                        : "you owe the house"}
                      {" · "}paid {formatMoney(money.yourPaidPaise, { currency: house.currency })}
                    </CardDescription>
                    <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-[13px] text-text-muted">
                      <span>Paid: {formatMoney(money.yourPaidPaise, { currency: house.currency })}</span>
                      <span>Share: {formatMoney(money.yourSharePaise, { currency: house.currency })}</span>
                    </div>
                  </div>
                </CardCore>
              </CardShell>
            </Link>
          )}
        </SectionReveal>
      </div>
    </section>
  );
}