import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Readout } from "./readout";

/**
 * The number-first tile, and the thing this app puts on more screens than any
 * other component.
 *
 * Three rules it enforces so that eleven screens do not each invent their own:
 *
 *   * the number is the largest thing in the tile and it is tabular, because a
 *     row of tiles whose digits do not line up reads as a rough estimate;
 *   * the label sits *above* the number, not below it. A person scanning six
 *     tiles reads the number first and the label only for the one they stopped
 *     at, so the label's job is to be findable, not to be read;
 *   * `tone` colours the number only. A whole tile tinted green is a mood; a
 *     green number is a fact about the money.
 */

export type StatTone = "neutral" | "positive" | "negative" | "warning" | "brand";

/**
 * Tone colours the number and nothing else. A whole tile tinted green is a
 * mood; a green number is a fact about the money — and in this system it is
 * one of the only places colour appears at all.
 */
const TONE: Record<StatTone, string> = {
  neutral: "text-text",
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
  brand: "text-primary",
};

const SIZE = {
  sm: "text-[20px]",
  md: "text-[28px]",
  lg: "text-[36px]",
} as const;

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  size = "md",
  className,
  children,
}: {
  label: string;
  value: React.ReactNode;
  /** One line under the number. Context, never a second number. */
  sub?: React.ReactNode;
  tone?: StatTone;
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** A sparkline or meter, rendered under the value. */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-text-subtle">{icon}</span> : null}
        <span className="eyebrow-text truncate">{label}</span>
      </div>

      {/* The dot-matrix readout. This is the one number in the tile and it is
          meant to be read at a glance rather than parsed. A string goes through
          `Readout`, which sets the currency symbol in a face that has a glyph
          for it; anything else is rendered as given. */}
      {typeof value === "string" ? (
        <Readout value={value} size={size} className={TONE[tone]} />
      ) : (
        <span className={cn("readout leading-none", SIZE[size], TONE[tone])}>{value}</span>
      )}

      {children}
      {sub ? <span className="caption-text text-text-muted">{sub}</span> : null}
    </div>
  );
}

/**
 * A row of tiles that stays a row on a phone by scrolling, rather than becoming
 * a two-by-three grid nobody can compare across.
 */
export function StatRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Hairline dividers between tiles rather than four separate cards: the
        // row is one instrument with four readings, not four objects.
        "grid divide-border rounded-[var(--radius-lg)] border border-border bg-surface",
        "grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0",
        "[&>*]:p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A horizontal meter. Used for a target, a budget, or a week's progress.
 *
 * `over` is a separate state rather than a value above 100: being over budget
 * is a different fact from being nearly at it, and it should not have to be
 * inferred from a bar that has run out of room.
 */
export function Meter({
  value,
  max,
  tone = "brand",
  label,
  className,
}: {
  value: number;
  max: number;
  tone?: StatTone;
  label?: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const ratio = value / safeMax;
  const over = ratio > 1;
  const percent = Math.max(0, Math.min(1, ratio)) * 100;

  const fill =
    over || tone === "negative"
      ? "bg-danger"
      : tone === "positive"
        ? "bg-success"
        : tone === "warning"
          ? "bg-warning"
          : "bg-primary";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]",
            fill,
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A sparkline. Deliberately tiny and deliberately unlabelled — it answers
 * "which way is this going", and anything more precise belongs in a chart with
 * an axis.
 *
 * Drawn as an SVG path rather than a chart library because this is eight
 * numbers and a stroke, and pulling a charting package for it would be the
 * single largest dependency on the page.
 */
export function Sparkline({
  points,
  tone = "brand",
  className,
  height = 28,
}: {
  points: number[];
  tone?: StatTone;
  className?: string;
  height?: number;
}) {
  if (points.length < 2) return null;

  const width = 96;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    // Inset by 2px top and bottom so a peak is not clipped by the stroke.
    const y = height - 2 - ((point - min) / span) * (height - 4);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  const stroke =
    tone === "positive"
      ? "var(--success)"
      : tone === "negative"
        ? "var(--danger)"
        : tone === "warning"
          ? "var(--warning)"
          : "var(--primary)";

  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className={cn("overflow-visible", className)}
      aria-hidden
      focusable="false"
      preserveAspectRatio="none"
    >
      <path d={area} fill={stroke} opacity="0.10" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The endpoint is emphasised because "where it is now" is the one value
          in a sparkline anybody actually reads. */}
      <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} />
    </svg>
  );
}
