import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/**
 * Status is never conveyed by colour alone — every chip carries its text
 * (docs/08-UI-UX-SPEC.md section 7).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-4 transition-colors",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-text-muted",
        success: "bg-success-bg text-success",
        warning: "bg-warning-bg text-warning",
        danger: "bg-danger-bg text-danger",
        info: "bg-info-bg text-info",
        primary: "bg-primary text-primary-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  animate = false,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { animate?: boolean }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function BadgeDot({ tone = "neutral", className, animate = false, ...props }: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary";
  className?: string;
  animate?: boolean;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const dotColors = {
    neutral: "bg-text-muted",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    primary: "bg-primary",
  };

  return <span className={cn("w-2 h-2 rounded-full", dotColors[tone], className)} {...props} />;
}