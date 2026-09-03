import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A card is a hairline, a radius and some padding. One box.
 *
 * The version this replaces rendered two nested divs — a "shell" carrying the
 * border and a "core" carrying the padding — and dropped its children on the
 * floor while doing it:
 *
 * ```tsx
 * <div className={cn("card-shell", className)} {...props}>
 *   <div className="card-core" />
 * </div>
 * ```
 *
 * `{...props}` carries `children`, and JSX children override a spread
 * `children`, so every `<Card>` in the app rendered an empty rounded rectangle.
 * 128 call sites across 47 files. Nothing caught it: the Vitest config matches
 * `*.test.ts` only, so the repository has never had a component render test,
 * and an empty card is not something a Playwright journey trips over — it
 * clicks links, and the links were elsewhere.
 *
 * That single bug is most of why the app "looked POC level" with "only one
 * thing" on a screen. It is also why this file is now boring: one element, the
 * class string built with `cn` so a caller's `p-0` actually beats the default
 * `p-4` through tailwind-merge rather than losing a stylesheet-order coin toss
 * to a `@layer utilities` rule.
 */

const CARD = "relative rounded-[var(--radius-lg)] border border-border bg-surface p-4";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(CARD, className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Kept because a handful of screens name the two halves separately, and
 * because `card-shell` / `card-core` are also written as bare classes in
 * places. `CardShell` is the same box as `Card`; `CardCore` is a padded
 * region inside something that already has the hairline.
 */
export function CardShell({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(CARD, className)} {...props}>
      {children}
    </div>
  );
}

export function CardCore({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-[var(--radius-lg)] p-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex items-center justify-between gap-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("heading-text", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("caption-text text-text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-3 flex items-center gap-2", className)} {...props} />;
}

export function CardAction({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 pt-4 border-t border-border", className)} {...props} />;
}
