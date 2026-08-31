"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { motion, useReducedMotion } from "motion/react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helperText, error, invalid, id, ...props }, ref) => {
    const reduce = useReducedMotion();
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const hasError = invalid || !!error;
    const hasValue = (props.value as string) || (props.defaultValue as string);

    return (
      <div className={cn("w-full", className)}>
        {label && (
          <motion.label
            htmlFor={inputId}
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-text-muted pointer-events-none transition-all duration-200 ease-[var(--ease-out)]",
              hasValue || props.placeholder
                ? "top-1.5 -translate-y-[1.5rem] text-[11px] text-primary"
                : "top-1/2 -translate-y-1/2 text-[15px] text-text-muted"
            )}
            initial={reduce ? undefined : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
          >
            {label}
          </motion.label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={hasError || undefined}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
            className={cn(
              "h-12 w-full rounded-[10px] border bg-surface px-3 text-[15px] text-text placeholder:text-transparent",
              "transition-colors focus:bg-surface disabled:opacity-50",
              hasError
                ? "border-danger focus:ring-2 focus:ring-danger/20"
                : "border-border focus:ring-2 focus:ring-primary/20",
              label && "pt-4",
              className,
            )}
            {...props}
          />
          <motion.div
            className="absolute inset-0 rounded-[10px] pointer-events-none"
            initial={reduce ? undefined : { opacity: 0 }}
            animate={{ opacity: hasError ? 1 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 rounded-[10px] border-2 border-danger/20" />
          </motion.div>
        </div>
        {error && (
          <motion.p
            id={`${inputId}-error`}
            className="mt-1.5 text-[12px] text-danger"
            initial={reduce ? undefined : { opacity: 0, y: -4 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            role="alert"
          >
            {error}
          </motion.p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1.5 text-[12px] text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    )
  },
);
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; helperText?: string; error?: string }
>(({ className, label, helperText, error, id, ...props }, ref) => {
  const reduce = useReducedMotion();
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  const hasError = !!error;

  return (
    <div className="w-full">
      {label && (
        <motion.label
          htmlFor={selectId}
          className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-text-muted pointer-events-none transition-all duration-200 ease-[var(--ease-out)]",
            "top-1.5 -translate-y-[1.5rem] text-[11px] text-primary"
          )}
          initial={reduce ? undefined : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: 1 }}
        >
          {label}
        </motion.label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={hasError || undefined}
          aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          className={cn(
            "h-12 w-full rounded-[10px] border bg-surface px-3 text-[15px] text-text appearance-none",
            "transition-colors focus:bg-surface disabled:opacity-50",
            hasError
              ? "border-danger focus:ring-2 focus:ring-danger/20"
              : "border-border focus:ring-2 focus:ring-primary/20",
            "pt-4 pr-10",
            className,
          )}
          {...props}
        >
          <option value="" disabled style={{ display: "none" }}>
            Select...
          </option>
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
      {error && (
        <motion.p
          id={`${selectId}-error`}
          className="mt-1.5 text-[12px] text-danger"
          initial={reduce ? undefined : { opacity: 0, y: -4 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          role="alert"
        >
          {error}
        </motion.p>
      )}
      {helperText && !error && (
        <p id={`${selectId}-helper`} className="mt-1.5 text-[12px] text-text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
});
Select.displayName = "Select";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, helperText, error, invalid, id, rows = 3, ...props }, ref) => {
    const reduce = useReducedMotion();
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const hasError = invalid || !!error;

    return (
      <div className={cn("w-full", className)}>
        {label && (
          <motion.label
            htmlFor={textareaId}
            className={cn(
              "absolute left-3 top-3 text-[15px] text-text-muted pointer-events-none transition-all duration-200 ease-[var(--ease-out)]",
              "top-1.5 -translate-y-[1.5rem] text-[11px] text-primary"
            )}
            initial={reduce ? undefined : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
          >
            {label}
          </motion.label>
        )}
        <div className="relative">
          <textarea
            ref={ref}
            id={textareaId}
            aria-invalid={hasError || undefined}
            aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
            rows={rows}
            className={cn(
              "w-full rounded-[10px] border bg-surface px-3 py-3 text-[15px] text-text placeholder:text-transparent resize-y min-h-[80px]",
              "transition-colors focus:bg-surface disabled:opacity-50",
              hasError
                ? "border-danger focus:ring-2 focus:ring-danger/20"
                : "border-border focus:ring-2 focus:ring-primary/20",
              label && "pt-4",
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <motion.p
            id={`${textareaId}-error`}
            className="mt-1.5 text-[12px] text-danger"
            initial={reduce ? undefined : { opacity: 0, y: -4 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            role="alert"
          >
            {error}
          </motion.p>
        )}
        {helperText && !error && (
          <p id={`${textareaId}-helper`} className="mt-1.5 text-[12px] text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    )
  },
);
Textarea.displayName = "Textarea";