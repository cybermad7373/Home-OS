import type { MoneyMode } from "@/lib/types/database";

/**
 * What the Money screen's second tile says about where you stand.
 *
 * This is a domain rule rather than a rendering detail, and it was written as
 * one line of JSX for long enough to get it wrong. `yourPaid - yourShare` is a
 * debt only in a household that settles between its members. A pot household
 * does not: `/settle` tells the same member "Nobody owes anybody — expenses are
 * recorded against whoever paid and never turn into debts", and the insights
 * card tells them "This home shares a pot, so nothing here is a debt". The
 * Money screen told them, about the same month, that they owed ₹1,931.60 — and
 * in red, which by D-71 means precisely "you owe the house".
 *
 * So the mode decides. In a pot home the tile reports the share it is, in ink;
 * colour is reserved for money genuinely owed, and there is none.
 */

export interface Totals {
  totalPaise: number;
  yourSharePaise: number;
  yourPaidPaise: number;
}

export interface PositionTile {
  label: string;
  /** Always non-negative — the label carries the direction. */
  paise: number;
  /** `ink` is the absence of a claim about debt, not a neutral shade of one. */
  tone: "ink" | "owed-to-you" | "you-owe";
}

export function positionTile(moneyMode: MoneyMode, totals: Totals): PositionTile {
  if (moneyMode === "pot") {
    return { label: "Your share", paise: totals.yourSharePaise, tone: "ink" };
  }

  const net = totals.yourPaidPaise - totals.yourSharePaise;
  if (net === 0) return { label: "Your position", paise: 0, tone: "ink" };

  return net > 0
    ? { label: "You are owed", paise: net, tone: "owed-to-you" }
    : { label: "You owe", paise: -net, tone: "you-owe" };
}
