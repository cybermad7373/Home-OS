import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PendingItem {
  key: string;
  label: string;
  href: string;
  count: number;
  urgent: boolean;
}

/**
 * What the house is waiting on you for, at the very top, before anything the
 * house merely wants you to know.
 *
 * Two things changed from 2.0. The urgent rows had a tinted background and a
 * pulsing dot each, so a screen with three of them was three competing alarms;
 * now urgency is the accent rule down the left edge and the count in accent —
 * one signal, spent once per row. And it no longer animates in: a list that
 * slides in from the left every time you open Home makes the first thing you
 * see the last thing to arrive.
 */
export function HomePendingBlock({ pending }: { pending: PendingItem[] }) {
  if (pending.length === 0) return null;

  return (
    <section aria-labelledby="waiting-on-you" className="mb-8">
      <p id="waiting-on-you" className="eyebrow-text mb-2">
        Waiting on you
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        {pending.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={cn(
                "touch-target relative flex items-center gap-3 py-3 pl-4 pr-3 transition-colors hover:bg-surface-2",
                item.urgent && "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent",
              )}
            >
              <span className="min-w-0 flex-1 text-[15px]">{item.label}</span>
              <span
                className={cn(
                  "readout shrink-0 text-[15px] leading-none",
                  item.urgent ? "text-accent" : "text-text",
                )}
              >
                {item.count}
              </span>
              <ChevronRight size={15} className="shrink-0 text-text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
