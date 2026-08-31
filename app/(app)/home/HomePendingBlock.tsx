"use client";

import Link from "next/link";
import { Card, CardShell, CardCore } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, useReducedMotion } from "motion/react";
import { SectionReveal } from "@/components/motion/StaggerReveal";
import { cn } from "@/lib/utils/cn";

interface PendingItem {
  key: string;
  label: string;
  href: string;
  count: number;
  urgent: boolean;
}

interface HomePendingBlockProps {
  pending: PendingItem[];
}

export function HomePendingBlock({ pending }: HomePendingBlockProps) {
  const reduce = useReducedMotion();
  
  if (pending.length === 0) return null;

  return (
    <SectionReveal>
      <CardShell className="mb-4 overflow-hidden border-warning/30">
        <CardCore className="p-0">
          <ul className="divide-y divide-border" role="list" aria-label="Pending items needing attention">
            {pending.map((item, index) => (
              <motion.li
                key={item.key}
                initial={reduce ? false : { opacity: 0, x: -20 }}
                animate={reduce ? false : { opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  href={item.href}
                  className={cn(
                    "touch-target flex items-center justify-between gap-3 px-4 py-3 transition-colors",
                    item.urgent ? "bg-danger/5 hover:bg-danger/10" : "hover:bg-surface-2"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {item.urgent && (
                      <motion.span
                        className="w-2 h-2 rounded-full bg-danger flex-shrink-0"
                        initial={reduce ? false : { scale: 0 }}
                        animate={reduce ? false : { scale: 1 }}
                        transition={{ delay: index * 0.05 + 0.3, duration: 0.3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                      />
                    )}
                    <span className="text-[15px] font-medium truncate">{item.label}</span>
                  </div>
                  <Badge tone={item.urgent ? "danger" : "warning"} animate>
                    {item.count}
                  </Badge>
                </Link>
              </motion.li>
            ))}
          </ul>
        </CardCore>
      </CardShell>
    </SectionReveal>
  );
}