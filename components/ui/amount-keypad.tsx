"use client";

import { cn } from "@/lib/utils/cn";

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
      <div className="mb-4 text-center">
        <span className="text-text-muted">{currency}</span>
        <span className="tabular ml-1 text-[40px] font-bold leading-tight">
          {formatWhileTyping(value)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Amount keypad">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === "⌫" ? "Delete" : key}
            className={cn(
              "touch-target h-14 rounded-[10px] bg-surface-2 text-[20px] font-medium",
              "transition-transform duration-75 ease-out active:scale-[0.97] hover:bg-border",
            )}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Groups the whole-rupee part the Indian way, without touching what was typed. */
function formatWhileTyping(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = Number(whole || "0").toLocaleString("en-IN");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
