/**
 * Money is stored as integer paise everywhere (DR-01). Rupees exist only at the
 * presentation boundary, and floating point never touches a stored value.
 */

const PAISE_PER_RUPEE = 100;

/** Parses a rupee decimal string ("1240.50") into integer paise. */
export function rupeesToPaise(input: string | number): number {
  const raw = String(input).trim().replace(/[, ]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`Not a valid rupee amount: ${input}`);
  }
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace("-", "").split(".");
  const paise =
    Number(whole) * PAISE_PER_RUPEE + Number(fraction.padEnd(2, "0"));
  return negative ? -paise : paise;
}

/** The plain numeric string, no symbol — for inputs and CSV. */
export function paiseToRupeeString(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / PAISE_PER_RUPEE);
  const remainder = abs % PAISE_PER_RUPEE;
  const body = `${rupees}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/**
 * Display form. Currency comes from the house, never hard-coded in a component
 * (NFR-12); the default is only a fallback for contexts with no house loaded.
 */
export function formatMoney(
  paise: number,
  options: { currency?: string; locale?: string; showPaise?: boolean } = {},
): string {
  const { currency = "INR", locale = "en-IN", showPaise } = options;
  const withPaise = showPaise ?? Math.abs(paise) % PAISE_PER_RUPEE !== 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: withPaise ? 2 : 0,
    maximumFractionDigits: withPaise ? 2 : 0,
  }).format(paise / PAISE_PER_RUPEE);
}

/** Green means the house owes you; red means you owe the house. Never inverts. */
export function toneForAmount(paise: number): "positive" | "negative" | "neutral" {
  if (paise > 0) return "positive";
  if (paise < 0) return "negative";
  return "neutral";
}
