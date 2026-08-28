import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeBalances } from "@/lib/domain/settlement/netting";
import {
  checkPosition,
  positionOf,
  reserveBalance,
  reservePosition,
  type ReserveMovement,
} from "@/lib/domain/settlement/position";
import { reserveDrawRefusal } from "@/lib/domain/governance/preview";

/**
 * The household financial position — docs/06-ALGORITHMS.md section 6.5,
 * BR-280 to BR-288.
 */

describe("an expected contribution", () => {
  const balances = computeBalances([
    { memberId: "amma", paidPaise: 400000, fairSharePaise: 600000 },
    { memberId: "ravi", paidPaise: 800000, fairSharePaise: 600000 },
  ]);

  it("charges nobody and changes no settlement figure (BR-280)", () => {
    const withExpectation = positionOf(
      balances,
      new Map([["amma", 1500000]]),
    );
    const without = positionOf(balances);

    // The only difference between the two views is the two display columns.
    expect(withExpectation.map((row) => row.variancePaise)).toEqual(
      without.map((row) => row.variancePaise),
    );
    expect(withExpectation.map((row) => row.fairSharePaise)).toEqual(
      without.map((row) => row.fairSharePaise),
    );

    const amma = withExpectation.find((row) => row.memberId === "amma")!;
    expect(amma.expectedPaise).toBe(1500000);
    expect(amma.againstExpectedPaise).toBe(400000 - 1500000);
    expect(amma.variancePaise).toBe(-200000);
  });

  it("says nothing at all when none is set", () => {
    const ravi = positionOf(balances).find((row) => row.memberId === "ravi")!;
    expect(ravi.expectedPaise).toBeNull();
    expect(ravi.againstExpectedPaise).toBeNull();
  });

  it("is the same number as the settlement's expense net (BR-282)", () => {
    for (const row of positionOf(balances)) {
      const balance = balances.find((entry) => entry.memberId === row.memberId)!;
      expect(row.variancePaise).toBe(balance.expenseNetPaise);
    }
  });
});

describe("the reserve", () => {
  const movements: ReserveMovement[] = [
    { kind: "contribution", amountPaise: 500000 },
    { kind: "contribution", amountPaise: 300000 },
    { kind: "draw", amountPaise: 200000 },
  ];

  it("balances to contributions minus draws (BR-283)", () => {
    expect(reserveBalance(movements)).toBe(600000);
  });

  it("holds a position of what the members put in, and no more", () => {
    // A draw spends the pot's cash and relieves the members of the same cost in
    // one movement, so it moves the balance and not the position.
    expect(reservePosition(movements)).toBe(-800000);
    expect(reservePosition(movements.slice(0, 2))).toBe(-800000);
  });

  it("reduces nobody's owed figure by existing (BR-286)", () => {
    const balances = computeBalances([
      { memberId: "a", paidPaise: 900000, fairSharePaise: 300000 },
      { memberId: "b", paidPaise: 0, fairSharePaise: 300000 },
      { memberId: "c", paidPaise: 0, fairSharePaise: 300000 },
    ]);

    // b is in deficit and the pot holds ₹6,000. The deficit stands (E-86).
    const funded = positionOf(balances);
    expect(funded.find((row) => row.memberId === "b")!.variancePaise).toBe(-300000);
  });
});

describe("a draw larger than the pot", () => {
  it("is refused before anybody is asked, with the balance in the sentence", () => {
    const refusal = reserveDrawRefusal(250000, 400000)!;
    expect(refusal).toContain("2,500.00");
    expect(refusal).toContain("4,000.00");
  });

  it("allows a draw for exactly the balance", () => {
    expect(reserveDrawRefusal(250000, 250000)).toBeNull();
  });

  it("refuses a draw for nothing", () => {
    expect(reserveDrawRefusal(250000, 0)).not.toBeNull();
  });
});

describe("the property that must hold", () => {
  /**
   * BR-288, with the sign the arithmetic has: `Σ variance(m) + reserve
   * position = 0`, where the pot's position is what the members put into it.
   *
   * The generator builds a real month: expenses that split across the Home and
   * therefore net to zero on their own, plus contributions into the pot, which
   * are money that left a member and has not been split across anybody.
   */
  it("conserves money across the members and the pot", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5000000, max: 5000000 }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.array(
          fc.record({
            who: fc.nat({ max: 19 }),
            amountPaise: fc.integer({ min: 1, max: 2000000 }),
          }),
          { maxLength: 10 },
        ),
        fc.array(fc.integer({ min: 1, max: 1000000 }), { maxLength: 6 }),
        (nets, contributions, draws) => {
          const total = nets.reduce((sum, value) => sum + value, 0);
          nets[0] -= total;

          const ids = nets.map((_, index) => `m${String(index).padStart(3, "0")}`);
          const contributed = new Map<string, number>();
          for (const entry of contributions) {
            const id = ids[entry.who];
            if (!id) continue;
            contributed.set(id, (contributed.get(id) ?? 0) + entry.amountPaise);
          }

          const balances = computeBalances(
            nets.map((net, index) => ({
              memberId: ids[index],
              // BR-284: a contribution is a real movement of that member's
              // money, so it raises their `paid` alongside the pot's balance.
              paidPaise: Math.max(0, net) + (contributed.get(ids[index]) ?? 0),
              fairSharePaise: Math.max(0, -net),
            })),
          );

          const movements: ReserveMovement[] = [
            ...[...contributed.values()].map((amountPaise) => ({
              kind: "contribution" as const,
              amountPaise,
            })),
            // Draws only spend what is there. Anything more is refused before
            // it becomes a movement, by the trigger and by the proposal.
            ...boundedDraws(draws, [...contributed.values()].reduce((a, b) => a + b, 0)),
          ];

          const checks = checkPosition(positionOf(balances), movements);
          expect(checks.balances).toBe(true);
          expect(checks.sumPaise).toBe(0);
          expect(reserveBalance(movements)).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 400 },
    );
  });
});

/** Draws, capped so the running balance never goes below zero (BR-283). */
function boundedDraws(amounts: number[], funded: number): ReserveMovement[] {
  const movements: ReserveMovement[] = [];
  let balance = funded;
  for (const amount of amounts) {
    if (amount > balance) continue;
    balance -= amount;
    movements.push({ kind: "draw", amountPaise: amount });
  }
  return movements;
}
