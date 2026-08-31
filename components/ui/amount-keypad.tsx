"use client";

import { cn } from "@/lib/utils/cn";
import { motion, useReducedMotion } from "motion/react";

/**
 * The numeric keypad from S-17.
 *
 * A custom pad rather than a number input: the mobile keyboard costs a layout
 * shift and hides half the sheet, and this screen has a stated target of three
 * taps and a number. Keys are 44 px minimum and the whole thing stays reachable
 * with one thumb.
 */
export function AmountKeypad({
  value,
  onChange,
  currency = "₹",
}: {
  value: string;
  onChange: (next: string) => void;
  currency?: string;
}) {
  const reduce = useReducedMotion();

  function press(key: string) {
    if (key === "⌫") {
      onChange(value.length <= 1 ? "0" : value.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (value.includes(".")) return;
      onChange(`${value}.`);
      return;
    }
    // Two decimal places and no more — paise are the smallest unit there is.
    const [, fraction] = value.split(".");
    if (fraction !== undefined && fraction.length >= 2) return;
    onChange(value === "0" ? key : `${value}${key}`);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

  return (
    <div>
      <motion.div
        className="mb-4 text-center"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={reduce ? false : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="text-text-muted">{currency}</span>
        <motion.span
          className="tabular ml-1 text-[44px] font-bold leading-tight"
          initial={reduce ? false : { scale: 0.9 }}
          animate={reduce ? false : { scale: 1 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        >
          {formatWhileTyping(value)}
        </motion.span>
      </motion.div>

      <motion.div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="Amount keypad"
        initial={reduce ? false : { opacity: 0 }}
        animate={reduce ? false : { opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        {keys.map((key, index) => (
          <motion.button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === "⌫" ? "Delete" : key}
            className={cn(
              "touch-target h-14 rounded-[10px] bg-surface-2 text-[20px] font-medium",
              "transition-transform duration-75 ease-out active:scale-[0.95] hover:bg-border",
              key === "⌫" && "text-text-muted"
            )}
            whileTap={{ scale: 0.92 }}
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={reduce ? false : { opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.02, duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            {key === "⌫" && (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            )}
            {key !== "⌫" && key}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

/** Groups the whole-rupee part the Indian way, without touching what was typed. */
function formatWhileTyping(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = Number(whole || "0").toLocaleString("en-IN");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}