import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A number set in the dot-matrix display face, with the parts that are not
 * digits handled properly.
 *
 * Doto has no rupee glyph. Set `₹1,24,850` in it and the browser falls back for
 * the symbol alone, so a 44px headline renders as a heavy grotesk ₹ welded to a
 * dot-matrix number — the single most visible flaw in the first pass of this
 * design system, and on the one screen element the whole product is about.
 *
 * So the symbol is split out and set deliberately: the same weight, a little
 * smaller, and in the mono face it actually has a glyph for. The digits keep
 * the readout. It reads as one number because the two halves share a baseline
 * and a colour, and it survives a missing font because the fallback for each
 * half is a face that can draw it.
 *
 * Anything that is not a digit, a separator or a sign — a `+`, a `%`, `pts` —
 * gets the same treatment for the same reason.
 */

const DIGITS = /^[0-9.,\s]+$/;

function split(value: string): { prefix: string; digits: string; suffix: string } {
  // `[\s\S]` rather than `.` with the `s` flag: the build target predates it.
  const match = value.match(/^([^\d]*)([\d.,\s]*)([\s\S]*)$/);
  if (!match) return { prefix: "", digits: value, suffix: "" };
  return { prefix: match[1] ?? "", digits: match[2] ?? "", suffix: match[3] ?? "" };
}

export function Readout({
  value,
  size = "md",
  className,
}: {
  /** Pre-formatted, because money is formatted at the UI boundary and nowhere else. */
  value: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const { prefix, digits, suffix } = split(value);

  // Nothing to split — a bare number, or something that is not one at all.
  if (!prefix && !suffix) {
    return <span className={cn("readout", SIZE[size], className)}>{value}</span>;
  }

  return (
    <span className={cn("readout inline-flex items-baseline", SIZE[size], className)}>
      {prefix ? <span className={AFFIX}>{prefix}</span> : null}
      {digits}
      {suffix ? <span className={AFFIX}>{suffix}</span> : null}
    </span>
  );
}

const SIZE = {
  sm: "text-[20px] leading-none",
  md: "text-[28px] leading-none",
  lg: "text-[36px] leading-none",
  xl: "text-[44px] leading-none",
} as const;

/**
 * The symbol sits at 0.62em: large enough to read, small enough that the digits
 * are unambiguously the thing being shown.
 */
const AFFIX =
  "font-mono text-[0.62em] font-medium tracking-normal opacity-70";

export function isPlainNumber(value: string): boolean {
  return DIGITS.test(value);
}
