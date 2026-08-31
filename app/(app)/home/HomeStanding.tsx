"use client";

import Link from "next/link";
import { Card, CardShell, CardCore } from "@/components/ui/card";
import { MemberAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CircularProgress } from "@/components/ui/progress";
import { SectionReveal, StaggerReveal, StaggerItem } from "@/components/motion/StaggerReveal";
import { motion, useReducedMotion } from "motion/react";
import { concentrationRatio } from "@/lib/domain/fairness/targets";
import type { StandingRow } from "@/lib/domain/fairness/targets";

interface HomeStandingProps {
  ranked: (StandingRow & { displayName?: string; avatarUrl?: string | null })[];
  meId: string;
}

export function HomeStanding({ ranked, meId }: HomeStandingProps) {
  const reduce = useReducedMotion();
  const topThree = ranked.slice(0, 3);
  const myRank = ranked.findIndex((r) => r.memberId === meId);
  const myRow = ranked.find((r) => r.memberId === meId);
  const showMyRow = myRank >= 3 && myRow;
  const displayRows = [...topThree, ...(showMyRow && myRow ? [myRow] : [])];
  const concentration = concentrationRatio(ranked);

  return (
    <SectionReveal>
      <section className="mt-8" aria-labelledby="standing-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="standing-heading" className="heading-text">House standing</h2>
          <Link className="caption-text text-primary hover:underline" href="/chores/standing">
            See all →
          </Link>
        </div>

        <CardShell>
          <CardCore className="p-0">
            {/* Concentration Ratio Header */}
            <div className="px-4 py-3 border-b border-border bg-surface-2/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 20V10" />
                    <path d="M12 20V4" />
                    <path d="M6 20v-6" />
                  </svg>
                </div>
                <div>
                  <p className="label-text">Top 3 concentration</p>
                  <p className="heading-text tabular-nums text-primary">{Math.round(concentration * 100)}%</p>
                </div>
              </div>
              <Badge tone={concentration > 0.45 ? "warning" : "success"}>
                {concentration > 0.45 ? "Unbalanced" : "Healthy"}
              </Badge>
            </div>

            {/* Standing Rows */}
            <ul className="divide-y divide-border" role="list" aria-label="House standing rankings">
              <StaggerReveal staggerDelay={0.06}>
                {displayRows.map((row, index) => (
                  <StaggerItem key={row.memberId}>
                    <StandingRowItem
                      row={row}
                      rank={index + 1}
                      isMe={row.memberId === meId}
                      isLast={index === displayRows.length - 1}
                      totalMembers={ranked.length}
                    />
                  </StaggerItem>
                ))}
              </StaggerReveal>
            </ul>
          </CardCore>
        </CardShell>
      </section>
    </SectionReveal>
  );
}

function StandingRowItem({
  row,
  rank,
  isMe,
  isLast,
  totalMembers,
}: {
  row: StandingRow & { displayName?: string; avatarUrl?: string | null; rank?: number };
  rank: number;
  isMe: boolean;
  isLast: boolean;
  totalMembers: number;
}) {
  const reduce = useReducedMotion();
  const progress = row.targetPoints > 0 ? Math.min(row.earnedPoints / row.targetPoints, 1) : 0;
  const variant = progress >= 1 ? "success" : progress >= 0.75 ? "primary" : progress >= 0.5 ? "warning" : "danger";

  return (
    <li className={isMe ? "bg-primary/5 relative" : ""}>
      {isMe && !reduce && (
        <motion.div
          className="absolute inset-0 -inset-px rounded-[1.25rem] border border-primary/20 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Rank */}
        <motion.div
          className="flex-shrink-0 w-10 flex items-center justify-center"
          initial={reduce ? undefined : { opacity: 0, x: -20 }}
          animate={reduce ? undefined : { opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <span className={cn(
            "font-bold tabular-nums text-[16px]",
            rank <= 3 ? "text-primary" : "text-text-muted"
          )}>
            {rank}
          </span>
        </motion.div>

        {/* Avatar */}
        <motion.div
          initial={reduce ? undefined : { opacity: 0, scale: 0.8 }}
          animate={reduce ? undefined : { opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        >
          <MemberAvatar
            name={isMe ? "You" : row.displayName ?? "Someone"}
            avatarUrl={row.avatarUrl ?? null}
            size="md"
            status="home"
            ring={isMe}
          />
        </motion.div>

        {/* Name & Progress */}
        <div className="flex-1 min-w-0">
          <p className={cn("truncate font-medium", isMe ? "text-primary" : "text-text")}>
            {isMe ? "You" : row.displayName ?? "Someone"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <CircularProgress
              value={row.earnedPoints}
              max={row.targetPoints}
              size={36}
              strokeWidth={4}
              variant={variant}
              showValue={false}
              animate={true}
            />
            <span className="caption-text text-text-muted tabular-nums">
              {row.earnedPoints} / {row.targetPoints} pts
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-shrink-0 hidden sm:flex flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="tabular-nums font-medium">{row.choresDone}</span>
          </div>
          {row.choresMissed > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-danger">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span className="tabular-nums font-medium">{row.choresMissed}</span>
            </div>
          )}
          <div className="caption-text text-text-subtle tabular-nums">
            Carry: {row.carry >= 0 ? "+" : ""}{row.carry}
          </div>
        </div>
      </div>
    </li>
  );
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}