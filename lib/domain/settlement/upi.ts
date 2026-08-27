import { paiseToRupeeString } from "@/lib/utils/money";

/**
 * UPI deep links (docs/02-TRD.md section 5.3).
 *
 * The app never confirms a payment by itself. A UPI link opens a payment app
 * with the amount filled in; whether money actually moved is a human assertion
 * by the payer and then by the receiver. Anything else would be pretending to
 * an authority the app does not have.
 */

export interface UpiLinkInput {
  payeeVpa: string | null;
  payeeName: string;
  amountPaise: number;
  note: string;
}

/** Returns null without a VPA — the settlement still shows, just without a tap. */
export function buildUpiLink(input: UpiLinkInput): string | null {
  if (!input.payeeVpa) return null;

  const params = new URLSearchParams({
    pa: input.payeeVpa,
    pn: input.payeeName,
    am: paiseToRupeeString(input.amountPaise),
    cu: "INR",
    tn: input.note,
  });

  return `upi://pay?${params.toString()}`;
}

/** "HouseOS Aug 2026" — what the payer sees in their bank app's history. */
export function settlementNote(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `HouseOS ${label}`;
}
