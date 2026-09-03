"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/utils/media-query";
import { formatMoney } from "@/lib/utils/money";

interface NumberCountUpProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
  formatter?: (value: number) => string;
}

export function NumberCountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  duration = 400,
  formatter,
}: NumberCountUpProps) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [displayValue, setDisplayValue] = useState(value);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef<number>(value);

  useEffect(() => {
    if (reduce) {
      setDisplayValue(value);
      return;
    }

    if (value === startValueRef.current) return;

    const startValue = startValueRef.current;
    const endValue = value;
    startTimeRef.current = performance.now();
    startValueRef.current = value;

    function animate(currentTime: number) {
      if (!startTimeRef.current) return;
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduce]);

  const formatted = formatter
    ? formatter(displayValue)
    : `${prefix}${displayValue.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

  return <span className={`count-up tabular ${className || ""}`}>{formatted}</span>;
}

interface CountUpNumberProps {
  value: number;
  decimals?: number;
  className?: string;
  duration?: number;
}

export function CountUpNumber({
  value,
  decimals = 0,
  className,
  duration = 400,
}: CountUpNumberProps) {
  return (
    <NumberCountUp
      value={value}
      decimals={decimals}
      className={className}
      duration={duration}
      formatter={(v) => v.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    />
  );
}

interface CountUpMoneyProps {
  paise: number;
  /** The house's ISO currency code — "INR", not a symbol. */
  currency?: string;
  className?: string;
  duration?: number;
}

/**
 * Money, counting up.
 *
 * It formats through `formatMoney` rather than building a string here. The
 * version this replaces took a `currency` prop and special-cased the literal
 * "₹", falling back to `` `${currency} ` `` for anything else — and what every
 * caller actually passes is `house.currency`, the ISO code. So the Home screen
 * rendered "INR 9,658.00" while every other amount on the same screen, going
 * through `formatMoney`, rendered "₹9,658". One formatter, one boundary.
 */
export function CountUpMoney({
  paise,
  currency = "INR",
  className,
  duration = 400,
}: CountUpMoneyProps) {
  return (
    <NumberCountUp
      value={paise}
      className={className}
      duration={duration}
      formatter={(value) => formatMoney(Math.round(value), { currency })}
    />
  );
}

interface CountUpPointsProps {
  points: number;
  className?: string;
  duration?: number;
}

export function CountUpPoints({
  points,
  className,
  duration = 400,
}: CountUpPointsProps) {
  return (
    <NumberCountUp
      value={points}
      decimals={0}
      suffix=" pts"
      className={className}
      duration={duration}
      formatter={(v) => `${v.toLocaleString()} pts`}
    />
  );
}