import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/**
 * Status is never conveyed by colour alone — every chip carries its text
 * (docs/08-UI-UX-SPEC.md section 7).
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
    "text-[11px] font-medium leading-[18px] tracking-[0.02em] transition-colors",
  ].join(" "),
  {
    variants: {
      tone: {
        // Outlined rather than filled, so a row of five badges reads as a row
        // of five labels instead of five blocks of colour.
        neutral: "border-border bg-transparent text-text-muted",
        success: "border-success/30 bg-success-bg text-success",
        warning: "border-warning/30 bg-warning-bg text-warning",
        danger: "border-danger/30 bg-danger-bg text-danger",
        info: "border-border bg-surface-2 text-text",
        primary: "border-primary bg-primary text-primary-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function BadgeDot({ tone = "neutral", className, ...props }: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary";
  className?: string;
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