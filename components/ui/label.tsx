import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Label({
  className,
  hint,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label className={cn("label-text mb-1.5 block text-text", className)} {...props}>
      {children}
      {hint ? <span className="ml-2 font-normal text-text-subtle">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="caption-text mt-1.5 text-danger">
      {children}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}
