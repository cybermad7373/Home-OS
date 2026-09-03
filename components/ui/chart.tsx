import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The chart primitives.
 *
 * Hand-drawn SVG rather than a charting library, and that is a considered
 * choice rather than a saving: every chart this app needs is a bar, a stacked
 * bar or a share-of-total, over at most twelve categories, rendered on the
 * server. A charting package would add a client bundle and a hydration
 * boundary to a page whose entire job is to render some numbers as rectangles.
 *
 * What the shared primitives buy is the thing eleven ad-hoc charts never have:
 * one palette, one grid weight, one label treatment, and colours that come from
 * the theme so a chart is legible in dark mode without a second design pass.
 *
 * Colour is never the only encoding. Every series is labelled in a legend and
 * every bar carries its value, because a reader who cannot separate two of the
 * eight hues should still be able to read the chart.
 */

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export interface Slice {
  label: string;
  value: number;
  /** Overrides the palette — use for semantic series only (owed, spent, saved). */
  color?: string;
}

/**
 * A horizontal bar chart. Horizontal because the labels are words — "Groceries",
 * "Eating out" — and a vertical chart has to rotate them or truncate them.
 */
export function BarChart({
  data,
  format,
  max,
  className,
  emptyLabel = "Nothing to show yet",
}: {
  data: Slice[];
  /** How a value is written out. Money is formatted at the UI boundary, here. */
  format: (value: number) => string;
  /** Defaults to the largest value, so the biggest bar always fills the row. */
  max?: number;
  className?: string;
  emptyLabel?: string;
}) {
  const rows = data.filter((row) => Number.isFinite(row.value));
  if (rows.length === 0) {
    return <p className="caption-text text-text-muted">{emptyLabel}</p>;
  }

  const ceiling = max ?? Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {rows.map((row, index) => {
        const percent = ceiling > 0 ? Math.max(0, (row.value / ceiling) * 100) : 0;
        return (
          <li key={row.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[14px]">{row.label}</span>
              <span className="tabular shrink-0 text-[14px] font-medium">{format(row.value)}</span>
            </div>
            <div className="h-[6px] w-full bg-surface-3">
              <div
                className="h-full"
                style={{
                  width: `${percent}%`,
                  background: row.color ?? chartColor(index),
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A single stacked bar — share of one total. The right shape for "where the
 * month went", and a much better one than a pie: a reader can compare two
 * segments along a line, and cannot compare two angles.
 */
export function ShareBar({
  data,
  format,
  className,
}: {
  data: Slice[];
  format: (value: number) => string;
  className?: string;
}) {
  const rows = data.filter((row) => row.value > 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* A hairline between segments, because two neighbours on a greyscale
          ramp are two steps apart and a shared edge makes them read as one. */}
      <div className="flex h-3 w-full gap-px bg-surface-3">
        {rows.map((row, index) => (
          <div
            key={row.label}
            style={{
              width: `${(row.value / total) * 100}%`,
              background: row.color ?? chartColor(index),
            }}
            title={`${row.label}: ${format(row.value)}`}
          />
        ))}
      </div>
      <Legend
        items={rows.map((row, index) => ({
          label: row.label,
          color: row.color ?? chartColor(index),
          value: `${format(row.value)} · ${Math.round((row.value / total) * 100)}%`,
        }))}
      />
    </div>
  );
}

/**
 * Grouped columns over time — the one chart shape that genuinely wants a
 * vertical axis, because the x axis is dates and dates read left to right.
 */
export function ColumnChart({
  data,
  format,
  className,
  height = 120,
}: {
  data: { label: string; value: number; tone?: "brand" | "positive" | "negative" }[];
  format: (value: number) => string;
  className?: string;
  height?: number;
}) {
  if (data.length === 0) return null;
  const ceiling = Math.max(...data.map((row) => row.value), 1);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="flex items-end gap-1.5 border-b border-chart-grid"
        style={{ height }}
        role="img"
        aria-label={data.map((row) => `${row.label}: ${format(row.value)}`).join(", ")}
      >
        {data.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="tabular text-[10px] text-text-subtle">
              {row.value > 0 ? format(row.value) : ""}
            </span>
            <div
              className={cn(
                "w-full",
                row.tone === "positive"
                  ? "bg-success"
                  : row.tone === "negative"
                    ? "bg-danger"
                    : "bg-primary",
              )}
              style={{
                height: `${Math.max(row.value > 0 ? 2 : 0, (row.value / ceiling) * (height - 20))}px`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {data.map((row) => (
          <span
            key={row.label}
            className="caption-text min-w-0 flex-1 truncate text-center text-text-subtle"
          >
            {row.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; value?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 border border-border"
            style={{ background: item.color }}
          />
          <span className="caption-text truncate">{item.label}</span>
          {item.value ? (
            <span className="caption-text tabular shrink-0 text-text-muted">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
