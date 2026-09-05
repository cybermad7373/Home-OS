import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Section } from "@/components/layout/section";
import { cn } from "@/lib/utils/cn";

/**
 * What to do with a home nobody has used yet.
 *
 * A new Home landed on a Home screen with an empty left half, "Nothing
 * assigned to you yet", and two nudges about availability and an AI key —
 * neither of which is the first thing anybody needs. There was no tour, no
 * worked example and nothing naming the four things that turn an empty Home
 * into a working one, so the honest first impression was of a product with
 * nothing in it.
 *
 * It is a checklist rather than a tour because a tour is a thing you dismiss
 * and a checklist is a thing you finish. Each step is a real link to the screen
 * that does it, and each one goes ticked the moment the underlying fact is
 * true — so it needs no dismissal, no stored state and no column: a Home in use
 * has finished it by definition, and `shouldShowFirstRun` stops rendering it.
 */

export interface FirstRunStep {
  id: string;
  title: string;
  body: string;
  href: string;
  done: boolean;
}

/**
 * Two or more steps outstanding means a Home nobody has set up. One
 * outstanding means a Home in use with a loose end, and a running household
 * does not need a checklist on its front page to tell it so.
 */
export function shouldShowFirstRun(steps: FirstRunStep[]): boolean {
  return steps.filter((step) => !step.done).length >= 2;
}

export function FirstRun({ steps }: { steps: FirstRunStep[] }) {
  const done = steps.filter((step) => step.done).length;

  return (
    <Section label={`Getting this home going · ${done} of ${steps.length}`}>
      <ol className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={cn(
                "group flex items-start gap-3 rounded-[var(--radius-lg)] border p-3 transition-colors",
                step.done
                  ? "border-border bg-transparent"
                  : "border-border bg-surface hover:border-primary",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  step.done
                    ? "border-success bg-success text-success-bg"
                    : "border-border-strong",
                )}
              >
                {step.done ? <Check size={12} strokeWidth={3} /> : null}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block font-medium",
                    step.done ? "text-text-muted line-through" : "text-text",
                  )}
                >
                  {step.title}
                </span>
                <span className="caption-text block text-text-muted">{step.body}</span>
              </span>

              {step.done ? null : (
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="mt-1 shrink-0 text-text-subtle transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5"
                />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </Section>
  );
}
