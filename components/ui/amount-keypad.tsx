"use client";

import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";
import { motion, useReducedMotion } from "motion/react";

/**
 * The numeric keypad from S-17.
 *
 * A custom pad rather than a number input: the mobile keyboard costs a layout
 * shift and hides half the sheet, and this screen has a stated target of three
 * taps and a number. Keys are 44 px minimum and the whole thing stays reachable
 * with one thumb.
 *
 * The amount itself is a real `<input>` behind that display, which it was not
 * before. The pad was the *only* way to enter a number: on a laptop you typed
 * 456, nothing happened, and the button still read Save ₹0 — so the app's most
 * used action was unusable with the keyboard already under the person's hands,
 * and it read as a broken form rather than a touch-first one. `inputMode` is
 * still `none` on a coarse pointer, so the phone keyboard stays shut and the
 * pad remains the way in on the device the pad was designed for.
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
  const inputMode = usePointerInputMode();

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
        className="mb-4 flex items-baseline justify-center gap-1"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={reduce ? false : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <span aria-hidden className="text-text-muted">
          {currency}
        </span>
        <input
          value={formatWhileTyping(value)}
          onChange={(event) => onChange(sanitiseTyped(event.target.value))}
          /*
            Select the whole thing on focus. The field starts at 0 and the sheet
            now puts the caret in it as soon as it opens — which browsers place
            at position *0*, before the zero. Typing 250 produced 2,500: the
            digits went in one at a time in front of a zero that never left, and
            sanitiseTyped only strips a leading zero, not a trailing one.

            Selecting means the first digit replaces the 0, which is also what
            the keypad does, so both ways in behave the same.
          */
          onFocus={(event) => event.currentTarget.select()}
          inputMode={inputMode}
          autoComplete="off"
          aria-label="Amount"
          // `size={1}` plus `w-auto` would fight the field-sizing here; the
          // field is centred and grows with the number instead.
          className={cn(
            "tabular min-w-0 max-w-full flex-none border-0 bg-transparent p-0",
            "text-[44px] font-bold leading-tight outline-none",
            "focus-visible:outline-none",
          )}
          style={{ width: `${Math.max(formatWhileTyping(value).length, 1)}ch` }}
        />
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
              "touch-target h-14 rounded-[var(--radius-sm)] bg-surface-2 text-[20px] font-medium",
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

/**
 * What a person typed, reduced to something this component can hold.
 *
 * Everything that is not a digit or a dot goes — including the grouping commas
 * this component itself put there. Two decimal places is the floor, because
 * paise are the smallest unit there is, and a second dot is dropped rather
 * than rejected: somebody typing 12..5 meant 12.5.
 */
export function sanitiseTyped(typed: string): string {
  const cleaned = typed.replace(/[^0-9.]/g, "");

  const firstDot = cleaned.indexOf(".");
  const whole = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  const fraction =
    firstDot === -1 ? null : cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);

  // A leading run of zeros is what "0" then "5" produces on the pad; the pad
  // handles that case itself, and this is the same rule for the keyboard.
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");

  if (trimmedWhole === "" && fraction === null) return "0";
  if (fraction === null) return trimmedWhole;
  return `${trimmedWhole === "" ? "0" : trimmedWhole}.${fraction}`;
}

/**
 * `none` on a touch screen, `decimal` everywhere else.
 *
 * The pad exists so a phone never has to raise its keyboard over half the
 * sheet, and that is still true. A laptop has no such keyboard to raise, and
 * refusing its physical one bought nothing.
 */
function usePointerInputMode(): "none" | "decimal" {
  const subscribe = useCallback((notify: () => void) => {
    const query = window.matchMedia("(pointer: coarse)");
    query.addEventListener("change", notify);
    return () => query.removeEventListener("change", notify);
  }, []);

  const coarse = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(pointer: coarse)").matches,
    // The server has no pointer to ask about. `decimal` is the safer guess for
    // the first paint: a phone that gets it re-renders before anybody can type,
    // and a laptop that got `none` would silently keep the old behaviour.
    () => false,
  );

  return coarse ? "none" : "decimal";
}

/** Groups the whole-rupee part the Indian way, without touching what was typed. */
function formatWhileTyping(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = Number(whole || "0").toLocaleString("en-IN");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}