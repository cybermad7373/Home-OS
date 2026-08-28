import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeMealShares, MealSplitError } from "@/lib/domain/food/split";

describe("computeMealShares", () => {
  it("sums exactly to the total for any total and 1-30 participants", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000_00 }),
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 30 }),
        (totalPaise, memberIds) => {
          const shares = computeMealShares(totalPaise, memberIds);
          const sum = shares.reduce((acc, s) => acc + s.sharePaise, 0);
          expect(sum).toBe(totalPaise);
          expect(shares).toHaveLength(memberIds.length);
        },
      ),
    );
  });

  it("splits ₹180 three ways as ₹60 each exactly", () => {
    const shares = computeMealShares(18000, ["a", "b", "c"]);
    expect(shares.every((s) => s.sharePaise === 6000)).toBe(true);
  });

  it("distributes the remainder one paisa at a time in ascending member-id order", () => {
    const shares = computeMealShares(10, ["c", "a", "b"]);
    const byId = Object.fromEntries(shares.map((s) => [s.memberId, s.sharePaise]));
    // 10 paise / 3 = 3 base, remainder 1 -> the lowest id ("a") gets the extra paisa.
    expect(byId.a).toBe(4);
    expect(byId.b).toBe(3);
    expect(byId.c).toBe(3);
  });

  it("is order-independent — same ids, same total, same result regardless of input order", () => {
    const a = computeMealShares(1801, ["m3", "m1", "m2"]);
    const b = computeMealShares(1801, ["m1", "m2", "m3"]);
    expect(a.sort((x, y) => x.memberId.localeCompare(y.memberId))).toEqual(
      b.sort((x, y) => x.memberId.localeCompare(y.memberId)),
    );
  });

  it("refuses an empty participant list rather than guessing", () => {
    expect(() => computeMealShares(1000, [])).toThrow(MealSplitError);
  });

  it("a total that does not divide still sums back to the total", () => {
    const shares = computeMealShares(1, ["a", "b", "c", "d", "e"]);
    expect(shares.reduce((acc, s) => acc + s.sharePaise, 0)).toBe(1);
    expect(shares.filter((s) => s.sharePaise === 1)).toHaveLength(1);
  });
});
