"use client";

import Link from "next/link";
import { Card, CardShell, CardCore, CardContent } from "@/components/ui/card";
import { MemberAvatar } from "@/components/ui/avatar";
import { formatMoney } from "@/lib/utils/money";
import { SectionReveal } from "@/components/motion/StaggerReveal";
import { RevealItem } from "@/components/motion/StaggerReveal";
import { motion, useReducedMotion } from "motion/react";

interface HomeOwesWhomProps {
  owes: Array<{
    fromMemberId: string;
    toMemberId: string;
    fromName: string;
    toName: string;
    amountPaise: number;
  }>;
  meId: string;
  house: { currency: string };
}

export function HomeOwesWhom({ owes, meId, house }: HomeOwesWhomProps) {
  const reduce = useReducedMotion();
  
  if (owes.length === 0) return null;

  const displayOwes = owes.slice(0, 3);
  const remaining = owes.length - 3;

  return (
    <SectionReveal>
      <section className="mt-8" aria-labelledby="owes-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="owes-heading" className="heading-text">Who owes whom</h2>
          <Link className="caption-text text-primary hover:underline" href="/settle">
            See all →
          </Link>
        </div>

        <CardShell className="overflow-hidden">
          <CardCore className="p-0">
            {/* Visual diagram for 3+ members */}
            {owes.length >= 3 && (
              <div className="p-4 border-b border-border bg-surface-2/30">
                <OwesDiagram owes={displayOwes} meId={meId} house={house} reduce={reduce} />
              </div>
            )}

            <ul className="divide-y divide-border" role="list" aria-label="Payment relationships">
              {displayOwes.map((row, index) => (
                <RevealItem key={`${row.fromMemberId}-${row.toMemberId}`} delay={index * 0.05}>
                  <li className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <MemberAvatar
                        name={row.fromMemberId === meId ? "You" : row.fromName}
                        size="sm"
                        status={row.fromMemberId === meId ? "home" : undefined}
                      />
                      <div className="min-w-0">
                        <p className="text-[15px] truncate">
                          <span className={row.fromMemberId === meId ? "font-medium" : ""}>
                            {row.fromMemberId === meId ? "You" : row.fromName}
                          </span>
                          <span className="text-text-muted">
                            {row.fromMemberId === meId ? " owe " : " owes "}
                          </span>
                          <span className={row.toMemberId === meId ? "font-medium" : ""}>
                            {row.toMemberId === meId ? "you" : row.toName}
                          </span>
                        </p>
                        <p className="caption-text text-text-muted">
                          {formatMoney(row.amountPaise, { currency: house.currency })}
                        </p>
                      </div>
                    </div>
                    <motion.span
                      className="shrink-0 font-medium tabular-nums"
                      initial={reduce ? false : { opacity: 0, x: 20 }}
                      animate={reduce ? false : { opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 + 0.2, duration: 0.3 }}
                    >
                      {formatMoney(row.amountPaise, { currency: house.currency })}
                    </motion.span>
                  </li>
                </RevealItem>
              ))}
            </ul>

            {remaining > 0 && (
              <div className="px-4 py-3 text-center text-text-muted caption-text border-t border-border">
                and {remaining} more {remaining === 1 ? "payment" : "payments"}
              </div>
            )}
          </CardCore>
        </CardShell>
      </section>
    </SectionReveal>
  );
}

function OwesDiagram({
  owes,
  meId,
  house,
  reduce,
}: {
  owes: Array<{
    fromMemberId: string;
    toMemberId: string;
    fromName: string;
    toName: string;
    amountPaise: number;
  }>;
  meId: string;
  house: { currency: string };
  reduce: boolean | null;
}) {
  // Get unique members involved
  const members = new Map<string, { name: string; isMe: boolean }>();
  owes.forEach((row) => {
    if (!members.has(row.fromMemberId)) {
      members.set(row.fromMemberId, { name: row.fromName, isMe: row.fromMemberId === meId });
    }
    if (!members.has(row.toMemberId)) {
      members.set(row.toMemberId, { name: row.toName, isMe: row.toMemberId === meId });
    }
  });

  const memberArray = Array.from(members.entries());
  const centerX = 120;
  const centerY = 80;
  const radius = 55;

  return (
    <div className="relative h-32" role="img" aria-label="Payment relationships between house members">
      <svg viewBox="0 0 240 160" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
        </defs>

        {/* Connections */}
        {owes.map((row, i) => {
          const fromIndex = memberArray.findIndex(([id]) => id === row.fromMemberId);
          const toIndex = memberArray.findIndex(([id]) => id === row.toMemberId);
          const fromAngle = (fromIndex / memberArray.length) * Math.PI * 2 - Math.PI / 2;
          const toAngle = (toIndex / memberArray.length) * Math.PI * 2 - Math.PI / 2;

          const fromX = centerX + radius * Math.cos(fromAngle);
          const fromY = centerY + radius * Math.sin(fromAngle);
          const toX = centerX + radius * Math.cos(toAngle);
          const toY = centerY + radius * Math.sin(toAngle);

          const midX = (fromX + toX) / 2;
          const midY = (fromY + toY) / 2;
          const angle = Math.atan2(toY - fromY, toX - fromX);

          const labelX = midX + 18 * Math.sin(angle);
          const labelY = midY - 18 * Math.cos(angle);

          const isMeInvolved = row.fromMemberId === meId || row.toMemberId === meId;

          return (
            <g key={`${row.fromMemberId}-${row.toMemberId}`} className={isMeInvolved ? "text-primary" : "text-border-strong"}>
              <motion.path
                d={`M${fromX} ${fromY} Q${centerX} ${centerY} ${toX} ${toY}`}
                stroke="currentColor"
                strokeWidth={isMeInvolved ? 2.5 : 1.5}
                fill="none"
                markerEnd="url(#arrowhead)"
                strokeDasharray={isMeInvolved ? "none" : "4 4"}
                initial={reduce ? false : { pathLength: 0 }}
                animate={reduce ? false : { pathLength: 1 }}
                transition={{ delay: i * 0.1 + 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight={600}
                fill="currentColor"
                className="tabular-nums"
                initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                animate={reduce ? false : { opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 + 0.5, duration: 0.3 }}
              >
                {formatMoney(row.amountPaise, { currency: house.currency })}
              </motion.text>
            </g>
          );
        })}

        {/* Member nodes */}
        {memberArray.map(([id, data], i) => {
          const angle = (i / memberArray.length) * Math.PI * 2 - Math.PI / 2;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          const isMe = data.isMe;

          return (
            <g key={id} transform={`translate(${x}, ${y})`}>
              <motion.circle
                r={22}
                fill={isMe ? "var(--primary)" : "var(--surface)"}
                stroke={isMe ? "var(--primary)" : "var(--border)"}
                strokeWidth={2}
                initial={reduce ? false : { scale: 0 }}
                animate={reduce ? false : { scale: 1 }}
                transition={{ delay: i * 0.05 + 0.1, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
              />
              <motion.text
                x={0}
                y={4}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight={600}
                fill={isMe ? "var(--primary-fg)" : "var(--text)"}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={reduce ? false : { opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 + 0.3, duration: 0.3 }}
              >
                {data.isMe ? "You" : data.name.charAt(0).toUpperCase()}
              </motion.text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}