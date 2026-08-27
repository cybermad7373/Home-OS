"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * Every input is labelled by a visible <Label>; placeholder-only labelling is
 * not used anywhere (accessibility table, docs/08-UI-UX-SPEC.md section 7).
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-[10px] border bg-surface-2 px-3 text-[15px] text-text placeholder:text-text-subtle",
        "transition-colors focus:bg-surface disabled:opacity-50",
        invalid ? "border-danger" : "border-border",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[15px] text-text",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";
