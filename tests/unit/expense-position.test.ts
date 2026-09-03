import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { positionTile, type Totals } from "@/lib/domain/expenses/position";

/**
 * Three screens disagreed about whether a pot household's members owe money.
 *
 * `/settle` said "Nobody owes anybody — expenses are recorded against whoever
 * paid and never turn into debts". The insights card said "This home shares a
 * pot, so nothing here is a debt". The Money screen, about the same member and
 * the same month, said "You owe ₹1,931.60" — in red, which by D-71 means
 * exactly "you owe the house". It reached that by computing
 * `yourPaid - yourShare` without ever looking at the money mode.
 *
 * The rule is one function now, and these are the cases that keep the three
 * screens saying the same thing.
 */

const totals = (yourPaidPaise: number, yourSharePaise: number): Totals => ({
  totalPaise: 100_000,
  yourPaidPaise,
  yourSharePaise,
});

describe("a pot household is never told it owes anything", () => {
  it("reports the share, not a net, however little the member paid", () => {
    // The seeded family home: share ₹1,931.60, paid nothing.
    expect(positionTile("pot", totals(0, 193_160))).toEqual({
      label: "Your share",
      paise: 193_160,
      tone: "ink",
    });
  });

  it("says the same thing to a member who paid for everything", () => {
    expect(positionTile("pot", totals(500_000, 193_160))).toEqual({
      label: "Your share",
      paise: 193_160,
      tone: "ink",
    });
  });

  it("never spends a money colour in a pot home, at any pair of figures", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (paid, share) => {
          const tile = positionTile("pot", totals(paid, share));
          // Green means the house owes you and red means you owe the house.
          // Neither is ever true here, so neither colour may appear.
          return tile.tone === "ink" && tile.label === "Your share";
        },
      ),
    );
  });
});

describe("a split household still gets the direction it settles in", () => {
  it("owes when it has paid less than its share", () => {
    expect(positionTile("split", totals(50_000, 193_160))).toEqual({
      label: "You owe",
      paise: 143_160,
      tone: "you-owe",
    });
  });

  it("is owed when it has paid more", () => {
    expect(positionTile("split", totals(500_000, 193_160))).toEqual({
      label: "You are owed",
      paise: 306_840,
      tone: "owed-to-you",
    });
  });

  it("claims neither direction when the two are equal", () => {
    expect(positionTile("split", totals(193_160, 193_160))).toEqual({
      label: "Your position",
      paise: 0,
      tone: "ink",
    });
  });

  it("never reports a negative figure — the label carries the direction", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (paid, share) => positionTile("split", totals(paid, share)).paise >= 0,
      ),
    );
  });

  it("gives the colour and the label the same direction, always", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (paid, share) => {
          const tile = positionTile("split", totals(paid, share));
          if (paid > share) return tile.tone === "owed-to-you" && tile.label === "You are owed";
          if (paid < share) return tile.tone === "you-owe" && tile.label === "You owe";
          return tile.tone === "ink";
        },
      ),
    );
  });

  it("is exact in paise — the figure is the difference and nothing rounded", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (paid, share) =>
          positionTile("split", totals(paid, share)).paise === Math.abs(paid - share),
      ),
    );
  });
});
