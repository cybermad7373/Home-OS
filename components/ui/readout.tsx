import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A number set at display size, with the parts that are not digits handled
 * properly.
 *
 * The split began as a repair. The display face was a dot-matrix one with no
 * rupee glyph, so `₹1,24,850` fell back for the symbol alone and a 44px
 * headline came out as a heavy grotesk ₹ welded to a dot-matrix number. The
 * face is gone (D-72) and the split has stayed, because it turned out to be
 * right on its own terms: a currency symbol at the same size as the figure
 * competes with it, and the number is what somebody came to read.
 *
 * So the symbol is set a little smaller at the same weight, on the same
 * baseline and in the same colour, and it reads as one number. Anything that is
 * not a digit, a separator or a sign — a `+`, a `%`, `pts` — gets the same
 * treatment for the same reason.
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

/**
 * The sizes are fluid above `sm`, because the thing being set is a rupee
 * amount and a rupee amount has no maximum width. `₹1,931.60` at a flat 36px
 * is 210px wide, which is wider than half a 360px phone — so the first version
 * of the two-up money panels ran the balance straight off the side of its own
 * card. `clamp` lets the figure give way on a narrow screen and stay at full
 * size everywhere else.
 */
const SIZE = {
  sm: "text-[clamp(16px,4.5vw,20px)] leading-none",
  md: "text-[clamp(20px,6vw,28px)] leading-none",
  lg: "text-[clamp(24px,7.5vw,36px)] leading-none",
  xl: "text-[clamp(30px,9vw,44px)] leading-none",
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
