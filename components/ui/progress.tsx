"use client";

import { cn } from "@/lib/utils/cn";
import { motion, useReducedMotion } from "motion/react";

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showValue?: boolean;
  variant?: "default" | "success" | "warning" | "danger" | "primary";
  animate?: boolean;
}

export function CircularProgress({
  value,
  max = 100,
  size = 64,
  strokeWidth = 6,
  className,
  showValue = true,
  variant = "primary",
  animate = true,
}: CircularProgressProps) {
  const reduce = useReducedMotion();
  const percentage = Math.min(Math.max(value / max, 0), 1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage);

  const variants = {
    default: "text-text-muted",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    primary: "text-primary",
  };

  const strokeColors = {
    default: "stroke-border",
    success: "stroke-success",
    warning: "stroke-warning",
    danger: "stroke-danger",
    primary: "stroke-primary",
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <motion.circle
          className="fill-none stroke-border/30"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          initial={reduce || !animate ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.circle
          className={cn("fill-none transition-colors", strokeColors[variant])}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            filter: variant !== "default" ? "drop-shadow(0 0 4px currentColor)" : "none",
          }}
        />
      </svg>
      {showValue && (
        <motion.div
          className={cn("absolute inset-0 flex items-center justify-center tabular-nums font-semibold", variants[variant])}
          style={{ fontSize: `${size * 0.22}px` }}
          initial={reduce || !animate ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
        >
          {Math.round(percentage * 100)}%
        </motion.div>
      )}
    </div>
  );
}

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "primary";
  animate?: boolean;
}

export function ProgressRing({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  className,
  children,
  variant = "primary",
  animate = true,
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const percentage = Math.min(Math.max(value / max, 0), 1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage);

  const strokeColors = {
    default: "stroke-border",
    success: "stroke-success",
    warning: "stroke-warning",
    danger: "stroke-danger",
    primary: "stroke-primary",
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="fill-none stroke-border/30"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          className={cn("fill-none transition-colors", strokeColors[variant])}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={reduce || !animate ? circumference : offset}
          strokeLinecap="round"
          style={{
            filter: variant !== "default" ? "drop-shadow(0 0 6px currentColor)" : "none",
          }}
          initial={reduce || !animate ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

interface LinearProgressProps {
  value: number;
  max?: number;
  height?: number;
  className?: string;
  variant?: "default" | "success" | "warning" | "danger" | "primary";
  showLabel?: boolean;
  label?: string;
  animate?: boolean;
  striped?: boolean;
}

export function LinearProgress({
  value,
  max = 100,
  height = 8,
  className,
  variant = "primary",
  showLabel = false,
  label,
  animate = true,
  striped = false,
}: LinearProgressProps) {
  const reduce = useReducedMotion();
  const percentage = Math.min(Math.max(value / max, 0), 1);

  const variants = {
    default: "bg-border",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    primary: "bg-primary",
  };

  const bgVariants = {
    default: "bg-border/30",
    success: "bg-success/20",
    warning: "bg-warning/20",
    danger: "bg-danger/20",
    primary: "bg-primary/20",
  };

  return (
    <div className={cn("w-full", className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5 text-[12px] text-text-muted">
          <span>{label || `${Math.round(percentage * 100)}%`}</span>
          {showLabel && <span className="font-mono tabular-nums text-primary">{Math.round(percentage * 100)}%</span>}
        </div>
      )}
      <div className={cn("relative h-full rounded-full overflow-hidden", bgVariants[variant])} style={{ height }}>
        <motion.div
          className={cn("h-full rounded-full transition-all", variants[variant])}
          style={{
            width: reduce || !animate ? `${percentage * 100}%` : "0%",
            backgroundImage: striped
              ? "linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)"
              : "none",
            backgroundSize: "1rem 1rem",
          }}
          initial={reduce || !animate ? false : { width: "0%" }}
          animate={{ width: `${percentage * 100}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

interface StatProgressProps {
  current: number;
  target: number;
  label?: string;
  subLabel?: string;
  size?: number;
  className?: string;
}

export function StatProgress({
  current,
  target,
  label,
  subLabel,
  size = 72,
  className,
}: StatProgressProps) {
  const percentage = target > 0 ? Math.min(current / target, 1) : 0;
  const isOver = current > target;
  const variant = isOver ? "success" : percentage >= 1 ? "success" : percentage >= 0.75 ? "primary" : percentage >= 0.5 ? "warning" : "danger";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <ProgressRing
        value={current}
        max={target}
        size={size}
        strokeWidth={Math.max(6, size / 12)}
        variant={variant}
        animate={true}
      >
        <div className="flex flex-col items-center">
          <span className="display-number tabular-nums text-text">{current}</span>
          <span className="caption-text text-text-muted">/ {target}</span>
        </div>
      </ProgressRing>
      {label && <p className="heading-text text-center">{label}</p>}
      {subLabel && <p className="caption-text text-text-muted text-center">{subLabel}</p>}
    </div>
  );
}