"use client";

import * as React from "react";
import { Label, FieldError } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

/**
 * The form controls, rewritten — and the rewrite is a bug fix before it is a
 * design change.
 *
 * `Select` had the same defect `Card` did. It rendered
 *
 * ```tsx
 * <select {...props}><option value="" disabled>Select…</option></select>
 * ```
 *
 * and JSX children override a spread `children`, so **every `<option>` every
 * caller passed was thrown away**. Thirty-six selects across the app: the month
 * picker on Money and Settle, the category and member filters, the recurrence
 * pickers, the severity and expiry on an announcement. All of them rendered as
 * an empty box with an arrow.
 *
 * `Input` set `placeholder:text-transparent` unconditionally, to make room for
 * a floating label — which was only rendered when a `label` prop was passed,
 * and was absolutely positioned inside a wrapper that had no `relative`, so it
 * would have floated against the page rather than the field. The net effect was
 * that **no placeholder in the app was visible**, including the one on the
 * natural-language expense field whose placeholder is the only instruction
 * telling you what to type.
 *
 * Both also spread `className` onto the wrapper *and* the control, so a caller
 * asking for `h-9 w-auto` got a 36px-tall control inside a 36px-tall wrapper
 * with the widths fighting.
 *
 * What replaces them is deliberately plain: one element, one class string
 * merged through `cn` so a caller's size wins, a real label above the field
 * rather than an animated one inside it, and the platform's own select
 * indicator instead of a hand-drawn chevron that has to be positioned against
 * a wrapper whose width the caller controls.
 */

const CONTROL = [
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3",
  "text-[15px] text-text placeholder:text-text-subtle",
  "transition-colors focus:border-border-strong disabled:opacity-50",
].join(" ");

const INVALID = "border-danger";

function useFieldId(id: string | undefined, label: string | undefined) {
  const generated = React.useId();
  return id ?? (label ? `${label.toLowerCase().replace(/\s+/g, "-")}-${generated}` : generated);
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, helperText, error, invalid, id, ...props },
  ref,
) {
  const fieldId = useFieldId(id, label);
  const bad = invalid || Boolean(error);

  const control = (
    <input
      ref={ref}
      id={fieldId}
      aria-invalid={bad || undefined}
      aria-describedby={error ? `${fieldId}-error` : helperText ? `${fieldId}-help` : undefined}
      className={cn(CONTROL, bad && INVALID, className)}
      {...props}
    />
  );

  return <Wrapper {...{ fieldId, label, helperText, error, control }} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    helperText?: string;
    error?: string;
  }
>(function Select({ className, label, helperText, error, id, children, ...props }, ref) {
  const fieldId = useFieldId(id, label);

  const control = (
    <select
      ref={ref}
      id={fieldId}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${fieldId}-error` : helperText ? `${fieldId}-help` : undefined}
      className={cn(CONTROL, "pr-8", error && INVALID, className)}
      {...props}
    >
      {children}
    </select>
  );

  return <Wrapper {...{ fieldId, label, helperText, error, control }} />;
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, helperText, error, invalid, id, rows = 3, ...props },
  ref,
) {
  const fieldId = useFieldId(id, label);
  const bad = invalid || Boolean(error);

  const control = (
    <textarea
      ref={ref}
      id={fieldId}
      rows={rows}
      aria-invalid={bad || undefined}
      aria-describedby={error ? `${fieldId}-error` : helperText ? `${fieldId}-help` : undefined}
      className={cn(CONTROL, "h-auto min-h-[84px] resize-y py-3", bad && INVALID, className)}
      {...props}
    />
  );

  return <Wrapper {...{ fieldId, label, helperText, error, control }} />;
});

/** The label above, the control, and whatever the control has to say for itself. */
function Wrapper({
  fieldId,
  label,
  helperText,
  error,
  control,
}: {
  fieldId: string;
  label?: string;
  helperText?: string;
  error?: string;
  control: React.ReactNode;
}) {
  // No label, no help, no error: the control is the whole thing, and wrapping
  // it in a div would break every caller that sizes it inside a flex row.
  if (!label && !helperText && !error) return <>{control}</>;

  return (
    <div>
      {label ? <Label htmlFor={fieldId}>{label}</Label> : null}
      {control}
      {error ? <FieldError>{error}</FieldError> : null}
      {helperText && !error ? (
        <p id={`${fieldId}-help`} className="caption-text mt-1.5 text-text-muted">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
