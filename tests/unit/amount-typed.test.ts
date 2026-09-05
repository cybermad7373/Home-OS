import { describe, expect, it } from "vitest";
import { sanitiseTyped } from "@/components/ui/amount-keypad";

/**
 * The amount field used to be a drawn keypad and nothing else. On a laptop you
 * typed 456 into it, nothing happened, and the button still read Save ₹0 — the
 * most used action in the app, unusable with the keyboard already under your
 * hands. There is a real input behind the display now, and this is the rule it
 * applies to whatever arrives in it.
 */

describe("sanitiseTyped", () => {
  it("keeps a plain number", () => {
    expect(sanitiseTyped("456")).toBe("456");
  });

  it("drops the grouping commas this component itself renders", () => {
    expect(sanitiseTyped("1,23,456")).toBe("123456");
  });

  it("throws away anything that is not a digit or a dot", () => {
    expect(sanitiseTyped("₹ 340 rupees")).toBe("340");
  });

  it("stops at two decimal places, because paise are the smallest unit", () => {
    expect(sanitiseTyped("12.3456")).toBe("12.34");
  });

  it("reads a second dot as a slip rather than as a rejection", () => {
    expect(sanitiseTyped("12..5")).toBe("12.5");
  });

  it("keeps a trailing dot so a decimal can still be typed", () => {
    expect(sanitiseTyped("12.")).toBe("12.");
  });

  it("puts the zero back in front of a bare decimal", () => {
    expect(sanitiseTyped(".75")).toBe("0.75");
  });

  it("strips the leading zero once a real digit follows it", () => {
    expect(sanitiseTyped("0456")).toBe("456");
  });

  it("empties to zero rather than to nothing", () => {
    expect(sanitiseTyped("")).toBe("0");
    expect(sanitiseTyped("abc")).toBe("0");
  });

  it("leaves a single zero alone", () => {
    expect(sanitiseTyped("0")).toBe("0");
  });
});
