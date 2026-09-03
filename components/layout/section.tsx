import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * A section on Home is a labelled hairline, not a card with a heading inside
 * it.
 *
 * The 2.0 Home stacked six cards, each with its own border, its own padding and
 * its own 16px heading, so the screen read as six competing objects and the eye
 * had nowhere to start. A rule with a technical label on it does the same job —
 * "this is where the money part begins" — while leaving the content itself as
 * the only thing with weight.
 */
export function Section({
  label,
  href,
  linkLabel = "All",
  children,
}: {
  label: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  const id = `sec-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="mt-8 first:mt-0">
      <div className="mb-3 flex items-center gap-3">
        <h2 id={id} className="eyebrow-text shrink-0">
          {label}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
        {href ? (
          <Link
            href={href}
            className="eyebrow-text group flex shrink-0 items-center gap-1 text-text-muted transition-colors hover:text-text"
          >
            {linkLabel}
            <ArrowUpRight size={11} className="magnetic-icon" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The app's one list surface: a hairline box with hairline dividers.
 *
 * Every screen was writing this class string out by hand, and they had drifted
 * — some rounded to `--radius-lg`, some to a literal `10px`, some wrapped in a
 * `<Card className="p-0">` that put a second border around the first.
 */
export function List({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn(
        "divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface",
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  );
}
