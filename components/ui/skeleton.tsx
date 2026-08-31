"use client";

import { cn } from "@/lib/utils/cn";
import { motion, useReducedMotion } from "motion/react";

/** Skeletons match the real layout's shape, so nothing shifts when data lands. */
export function Skeleton({ className, variant = "default" }: {
  className?: string;
  variant?: "default" | "text" | "circular" | "rectangular" | "card" | "avatar" | "button" | "stat";
}) {
  const reduce = useReducedMotion();

  const baseClass = "bg-surface-2 rounded-[10px]";

  const variants = {
    default: "h-4 w-full",
    text: "h-4 w-3/4",
    circular: "rounded-full",
    rectangular: "rounded-[10px]",
    card: "aspect-[4/3] rounded-[1.25rem]",
    avatar: "rounded-full",
    button: "h-11 rounded-full",
    stat: "h-8 w-24 rounded-[10px]",
  };

  const classNameMap = {
    default: "h-4 w-full",
    text: "h-4 w-3/4",
    circular: "h-10 w-10 rounded-full",
    rectangular: "h-12 w-32 rounded-[10px]",
    card: "aspect-[4/3] rounded-[1.25rem]",
    avatar: "h-10 w-10 rounded-full",
    button: "h-11 w-24 rounded-full",
    stat: "h-8 w-24 rounded-[10px]",
  };

  if (reduce) {
    return <div className={cn(baseClass, classNameMap[variant], className)} />;
  }

  return (
    <motion.div
      className={cn(baseClass, classNameMap[variant], className)}
      animate={{ backgroundColor: ["var(--surface-2)", "var(--border)", "var(--surface-2)"] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      style={{ backgroundSize: "200% 100%" }}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" className={i === lines - 1 ? "w-1/2" : ""} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card-shell", className)}>
      <div className="card-core space-y-3">
        <Skeleton variant="rectangular" className="h-6 w-1/3" />
        <Skeleton variant="text" className="h-4 w-3/4" />
        <Skeleton variant="text" className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div className={cn("card-shell", className)}>
      <div className="card-core space-y-3">
        <Skeleton variant="text" className="h-4 w-1/3" />
        <Skeleton variant="stat" />
        <Skeleton variant="rectangular" className="h-2 w-full" />
        <Skeleton variant="text" className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonList({ items = 5, className }: { items?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="card-shell">
          <div className="card-core flex items-center gap-3">
            <Skeleton variant="avatar" />
            <div className="flex-1 space-y-1.5">
              <Skeleton variant="text" className="w-1/3" />
              <Skeleton variant="text" className="w-1/4" />
            </div>
            <Skeleton variant="button" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ cols = 2, rows = 2, className }: { cols?: number; rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", `sm:grid-cols-${cols}`, className)}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}