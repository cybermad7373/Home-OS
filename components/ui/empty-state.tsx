"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useMediaQuery } from "@/lib/utils/media-query";
import { cn } from "@/lib/utils/cn";

/**
 * Every list has an explicit empty state: an illustration, one line of explanation, and
 * the action that resolves it. Never a bare "No data".
 */
type IllustrationType = 
  | "chores" 
  | "expenses" 
  | "food" 
  | "members" 
  | "notifications" 
  | "settlements" 
  | "rules" 
  | "calendar" 
  | "search" 
  | "generic";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
  illustration?: IllustrationType;
  /** @deprecated Use `illustration` instead */
  icon?: ReactNode;
  className?: string;
}

const illustrations: Record<IllustrationType, ReactNode> = {
  chores: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <path d="M20 50L32 62L60 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="40" cy="40" r="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4"/>
      <circle cx="20" cy="50" r="4" fill="currentColor"/>
      <circle cx="60" cy="30" r="4" fill="currentColor"/>
    </svg>
  ),
  expenses: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <rect x="18" y="22" width="44" height="36" rx="4" stroke="currentColor" strokeWidth="2"/>
      <path d="M18 34h44" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M32 40h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M40 30v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="50" cy="30" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M50 27v6M47 30h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  food: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <path d="M25 55c0-11 9-20 20-20s20 9 20 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <ellipse cx="45" cy="55" rx="15" ry="5" stroke="currentColor" strokeWidth="2"/>
      <path d="M30 55c0-8 7-15 15-15s15 7 15 15" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3"/>
      <circle cx="45" cy="45" r="3" fill="currentColor"/>
    </svg>
  ),
  members: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <circle cx="40" cy="30" r="14" stroke="currentColor" strokeWidth="2"/>
      <path d="M40 44c0 11-9 20-20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M40 44c0 11 9 20 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="40" cy="60" r="4" fill="currentColor" opacity="0.3"/>
    </svg>
  ),
  notifications: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <path d="M40 18C40 18 22 18 22 34c0 9.5 7 17 18 22 11-5 18-12.5 18-22C58 18 40 18 40 18z" stroke="currentColor" strokeWidth="2"/>
      <path d="M40 26v8M40 42h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  settlements: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <circle cx="25" cy="40" r="14" stroke="currentColor" strokeWidth="2"/>
      <circle cx="55" cy="40" r="14" stroke="currentColor" strokeWidth="2"/>
      <path d="M39 40L40 38L41 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M39 42L40 44L41 42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  rules: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <rect x="18" y="18" width="44" height="44" rx="6" stroke="currentColor" strokeWidth="2"/>
      <path d="M28 34h24M28 40h18M28 46h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M28 26h16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3"/>
    </svg>
  ),
  calendar: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <rect x="16" y="22" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="2"/>
      <path d="M16 34h48" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="20" y="18" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="50" y="18" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M30 40h20M30 48h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  search: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <circle cx="35" cy="35" r="18" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M48 48L60 60" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M35 25v20M25 35h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
  generic: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-border-strong">
      <circle cx="40" cy="40" r="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 6"/>
      <path d="M40 28v24M28 40h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

export function EmptyState({
  title,
  body,
  action,
  illustration = "generic",
  icon, // deprecated
  className,
}: EmptyStateProps) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const illus = icon ? "generic" : illustration;

  if (reduce) {
    return (
      <div className={cn(
        "flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-border px-6 py-12 text-center card-shell",
        className
      )}>
        <div className="text-text-subtle">{icon ?? illustrations[illus]}</div>
        <p className="heading-text">{title}</p>
        <p className="caption-text max-w-[36ch] text-text-muted">{body}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }

  return (
    <motion.div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[1.5rem] border border-dashed border-border px-6 py-12 text-center card-shell",
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-text-subtle">{icon ?? illustrations[illus]}</div>
      <p className="heading-text">{title}</p>
      <p className="caption-text max-w-[36ch] text-text-muted">{body}</p>
      {action && (
        <motion.div
          className="mt-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}

export function EmptyStateInline({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (reduce) {
    return (
      <div className={cn("flex items-center gap-3 px-4 py-3 rounded-[var(--radius-sm)] bg-surface-2/50", className)}>
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-border flex items-center justify-center text-text-subtle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" strokeDasharray="6 6"/>
            <path d="M12 8v8M12 8h.01" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="label-text">{title}</p>
          <p className="caption-text text-text-muted">{body}</p>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <motion.div
      className={cn("flex items-center gap-3 px-4 py-3 rounded-[var(--radius-sm)] bg-surface-2/50", className)}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-border flex items-center justify-center text-text-subtle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" strokeDasharray="6 6"/>
          <path d="M12 8v8M12 8h.01" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="label-text">{title}</p>
        <p className="caption-text text-text-muted">{body}</p>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </motion.div>
  );
}