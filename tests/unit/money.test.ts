import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  formatMoney,
  paiseToRupeeString,
  rupeesToPaise,
  toneForAmount,
} from "@/lib/utils/money";

/**
 * DR-01 and NFR-08. Every monetary calculation is exact, so the conversion at
 * the presentation boundary has to be exact in both directions.
 */
describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise("1240")).toBe(124000);
  });

  it("converts two decimal places", () => {
    expect(rupeesToPaise("1240.50")).toBe(124050);
  });

  it("pads a single decimal place", () => {
    expect(rupeesToPaise("1240.5")).toBe(124050);
  });

  it("handles the smallest unit", () => {
    expect(rupeesToPaise("0.01")).toBe(1);
  });

  it("strips grouping separators", () => {
    expect(rupeesToPaise("1,00,000")).toBe(10000000);
  });

  it("rejects anything that is not a rupee amount", () => {
    expect(() => rupeesToPaise("12.345")).toThrow();
    expect(() => rupeesToPaise("abc")).toThrow();
    expect(() => rupeesToPaise("")).toThrow();
  });
});

describe("paiseToRupeeString", () => {
  it("always shows two decimal places", () => {
    expect(paiseToRupeeString(124000)).toBe("1240.00");
    expect(paiseToRupeeString(1)).toBe("0.01");
    expect(paiseToRupeeString(0)).toBe("0.00");
  });

  it("keeps the sign", () => {
    expect(paiseToRupeeString(-12345)).toBe("-123.45");
  });
});

describe("round trip", () => {
  it("survives any paise amount up to ₹10,00,000", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000000, max: 100000000 }), (paise) => {
        expect(rupeesToPaise(paiseToRupeeString(paise))).toBe(paise);
      }),
    );
  });
});

describe("formatMoney", () => {
  it("omits paise when there are none", () => {
    expect(formatMoney(124000)).not.toContain(".");
  });

  it("shows paise when there are some", () => {
    expect(formatMoney(124050)).toContain(".50");
  });

  it("takes the currency from its caller rather than hard-coding one", () => {
    expect(formatMoney(100000, { currency: "USD", locale: "en-US" })).toContain("$");
  });
});

describe("toneForAmount", () => {
  it("maps positive to positive, negative to negative — this never inverts", () => {
    expect(toneForAmount(1)).toBe("positive");
    expect(toneForAmount(-1)).toBe("negative");
    expect(toneForAmount(0)).toBe("neutral");
  });
});
