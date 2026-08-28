import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyAdjustments,
  checkSettlement,
  computeBalances,
  distributePenaltyPool,
  minimiseTransfers,
  type MemberBalance,
} from "@/lib/domain/settlement/netting";
import { buildUpiLink, settlementNote } from "@/lib/domain/settlement/upi";

/**
 * The phase-3 property from docs/02-TRD.md section 9:
 *
 *   "Settlement nets to zero. The sum of all payments in, minus all payments
 *    out, is exactly zero across the house."
 */

function rupees(amount: number): number {
  return Math.round(amount * 100);
}

describe("the worked example from the algorithms document", () => {
  // August, 8 members, ₹48,250 total, with ₹500 of penalties in the pool.
  const fairShare = rupees(6031.25);

  const input: MemberBalance[] = [
    { memberId: "m1-ravi", paidPaise: rupees(31200), fairSharePaise: fairShare, penaltyCreditPaise: rupees(310) },
    { memberId: "m2-kumar", paidPaise: rupees(12000), fairSharePaise: fairShare, penaltyCreditPaise: rupees(190) },
    { memberId: "m3-vinoth", paidPaise: rupees(5050), fairSharePaise: fairShare },
    { memberId: "m4-suresh", paidPaise: 0, fairSharePaise: fairShare, penaltyOwedPaise: rupees(425) },
    { memberId: "m5-arun", paidPaise: 0, fairSharePaise: fairShare, penaltyOwedPaise: rupees(75) },
    { memberId: "m6-deepak", paidPaise: 0, fairSharePaise: fairShare },
    { memberId: "m7-manoj", paidPaise: 0, fairSharePaise: fairShare },
    { memberId: "m8-sathish", paidPaise: 0, fairSharePaise: fairShare },
  ];

  const balances = computeBalances(input);

  it("reproduces the published final nets", () => {
    const net = (id: string) =>
      balances.find((balance) => balance.memberId === id)!.finalNetPaise;

    expect(net("m1-ravi")).toBe(rupees(25478.75));
    expect(net("m2-kumar")).toBe(rupees(6158.75));
    expect(net("m3-vinoth")).toBe(rupees(-981.25));
    expect(net("m4-suresh")).toBe(rupees(-6456.25));
    expect(net("m5-arun")).toBe(rupees(-6106.25));
  });

  it("nets to exactly zero", () => {
    const sum = balances.reduce((total, balance) => total + balance.finalNetPaise, 0);
    expect(sum).toBe(0);
  });

  it("settles eight members in at most seven payments", () => {
    const payments = minimiseTransfers(balances);
    expect(payments.length).toBeLessThanOrEqual(7);

    const checks = checkSettlement(balances, payments);
    expect(checks.netsToZero).toBe(true);
    expect(checks.reconciles).toBe(true);
  });

  it("charges Suresh the price of doing no work", () => {
    const suresh = balances.find((balance) => balance.memberId === "m4-suresh")!;
    expect(suresh.penaltyOwedPaise).toBe(rupees(425));
    // His expense net alone was −₹6,031.25; the extra ₹425 is the penalty.
    expect(suresh.finalNetPaise).toBe(suresh.expenseNetPaise - rupees(425));
  });
});

describe("penalty pool", () => {
  it("distributes exactly what it collects (BR-107)", () => {
    const { owed, credit } = distributePenaltyPool(
      [
        { memberId: "a", carryPoints: 40 },
        { memberId: "b", carryPoints: 12 },
        { memberId: "c", carryPoints: -85 },
        { memberId: "d", carryPoints: -8 },
      ],
      500, // ₹5.00 per point
    );

    const collected = [...owed.values()].reduce((sum, value) => sum + value, 0);
    const paid = [...credit.values()].reduce((sum, value) => sum + value, 0);

    expect(collected).toBe(93 * 500);
    expect(paid).toBe(collected);
  });

  it("charges nobody when nobody carried a surplus", () => {
    // The pool would have no home, and money that goes nowhere breaks the
    // zero-sum invariant. Better to charge nothing than to invent a creditor.
    const { owed, credit } = distributePenaltyPool(
      [
        { memberId: "a", carryPoints: -10 },
        { memberId: "b", carryPoints: -20 },
      ],
      500,
    );

    expect(owed.size).toBe(0);
    expect(credit.size).toBe(0);
  });

  it("charges nothing at all in shadow mode", () => {
    // The roadmap's mitigation for the sharpest edge in the product: run the
    // first month at a rate of zero, so everybody sees what they would owe.
    const { owed, credit } = distributePenaltyPool(
      [
        { memberId: "a", carryPoints: 40 },
        { memberId: "b", carryPoints: -85 },
      ],
      0,
    );

    expect([...owed.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
    expect([...credit.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("splits the pool proportionally, remainder included", () => {
    const { owed, credit } = distributePenaltyPool(
      [
        { memberId: "a", carryPoints: 1 },
        { memberId: "b", carryPoints: 1 },
        { memberId: "c", carryPoints: 1 },
        { memberId: "d", carryPoints: -1 },
      ],
      100, // pool = 100 paise across three surplus members: 33, 33, 34
    );

    expect([...owed.values()].reduce((sum, value) => sum + value, 0)).toBe(100);
    expect([...credit.values()].reduce((sum, value) => sum + value, 0)).toBe(100);
  });
});

describe("edge cases", () => {
  it("produces no payments when everybody is square", () => {
    const balances = computeBalances([
      { memberId: "a", paidPaise: 1000, fairSharePaise: 1000 },
      { memberId: "b", paidPaise: 500, fairSharePaise: 500 },
    ]);
    expect(minimiseTransfers(balances)).toEqual([]);
  });

  it("handles a single member who paid for everything", () => {
    const balances = computeBalances([
      { memberId: "a", paidPaise: 5000, fairSharePaise: 5000 },
    ]);
    const payments = minimiseTransfers(balances);
    expect(payments).toEqual([]);
    expect(checkSettlement(balances, payments).netsToZero).toBe(true);
  });

  it("reports a non-zero sum rather than hiding it", () => {
    // Deliberately inconsistent input: this is what a defect upstream looks
    // like, and the close has to refuse rather than paper over it.
    const balances = computeBalances([
      { memberId: "a", paidPaise: 1000, fairSharePaise: 0 },
      { memberId: "b", paidPaise: 0, fairSharePaise: 500 },
    ]);
    const checks = checkSettlement(balances, minimiseTransfers(balances));
    expect(checks.netsToZero).toBe(false);
    expect(checks.sumOfNetsPaise).toBe(500);
  });
});

describe("the property that must hold", () => {
  it("nets to zero and reconciles, for any set of balances", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5000000, max: 5000000 }), {
          minLength: 1,
          maxLength: 30,
        }),
        (nets) => {
          // Force the inputs to sum to zero the way a real period does: the
          // total paid always equals the total of the fair shares.
          const total = nets.reduce((sum, value) => sum + value, 0);
          nets[0] -= total;

          const balances = computeBalances(
            nets.map((net, index) => ({
              memberId: `m${String(index).padStart(3, "0")}`,
              paidPaise: Math.max(0, net),
              fairSharePaise: Math.max(0, -net),
            })),
          );

          const payments = minimiseTransfers(balances);
          const checks = checkSettlement(balances, payments);

          expect(checks.netsToZero).toBe(true);
          expect(checks.reconciles).toBe(true);
          expect(checks.transferCount).toBeLessThanOrEqual(checks.maxPossible);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("never produces a payment of zero or a payment to oneself", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100000, max: 100000 }), {
          minLength: 2,
          maxLength: 20,
        }),
        (nets) => {
          const total = nets.reduce((sum, value) => sum + value, 0);
          nets[0] -= total;

          const balances = computeBalances(
            nets.map((net, index) => ({
              memberId: `m${index}`,
              paidPaise: Math.max(0, net),
              fairSharePaise: Math.max(0, -net),
            })),
          );

          for (const payment of minimiseTransfers(balances)) {
            expect(payment.amountPaise).toBeGreaterThan(0);
            expect(payment.fromMemberId).not.toBe(payment.toMemberId);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("is deterministic: the same balances always produce the same payments", () => {
    const balances = computeBalances([
      { memberId: "b", paidPaise: 3000, fairSharePaise: 1000 },
      { memberId: "a", paidPaise: 3000, fairSharePaise: 1000 },
      { memberId: "c", paidPaise: 0, fairSharePaise: 4000 },
    ]);
    expect(minimiseTransfers(balances)).toEqual(minimiseTransfers(balances));
  });
});

describe("UPI links", () => {
  it("builds a link with the amount already filled in", () => {
    const link = buildUpiLink({
      payeeVpa: "ravi@okhdfc",
      payeeName: "Ravi",
      amountPaise: 645625,
      note: settlementNote("2026-08"),
    })!;

    expect(link.startsWith("upi://pay?")).toBe(true);
    const params = new URLSearchParams(link.split("?")[1]);
    expect(params.get("pa")).toBe("ravi@okhdfc");
    expect(params.get("am")).toBe("6456.25");
    expect(params.get("cu")).toBe("INR");
    expect(params.get("tn")).toBe("HouseOS Aug 2026");
  });

  it("returns nothing without a VPA, so the row still shows", () => {
    expect(
      buildUpiLink({
        payeeVpa: null,
        payeeName: "Ravi",
        amountPaise: 100,
        note: "x",
      }),
    ).toBeNull();
  });
});

describe("adjustments folded into a close", () => {
  const balances = computeBalances([
    { memberId: "a", paidPaise: 3000, fairSharePaise: 1000 },
    { memberId: "b", paidPaise: 0, fairSharePaise: 1000 },
    { memberId: "c", paidPaise: 0, fairSharePaise: 1000 },
  ]);

  it("moves money between two members and creates none", () => {
    const adjusted = applyAdjustments(balances, [
      { fromMemberId: "b", toMemberId: "c", amountPaise: 400 },
    ]);

    const net = (id: string) =>
      adjusted.find((balance) => balance.memberId === id)!.finalNetPaise;

    expect(net("a")).toBe(2000);
    expect(net("b")).toBe(-1400);
    expect(net("c")).toBe(-600);
    expect(adjusted.reduce((sum, balance) => sum + balance.finalNetPaise, 0)).toBe(0);
  });

  it("skips an adjustment whose other end left the Home", () => {
    // Half a transfer is money invented. Nothing at all is the safe answer,
    // and the settlement still nets to zero without it.
    const adjusted = applyAdjustments(balances, [
      { fromMemberId: "b", toMemberId: "gone", amountPaise: 400 },
    ]);

    expect(adjusted).toEqual(balances);
  });

  it("still nets to zero and reconciles, for any set of adjustments", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5000000, max: 5000000 }), {
          minLength: 2,
          maxLength: 20,
        }),
        fc.array(
          fc.record({
            from: fc.nat({ max: 19 }),
            to: fc.nat({ max: 19 }),
            amountPaise: fc.integer({ min: 1, max: 2000000 }),
          }),
          { maxLength: 12 },
        ),
        (nets, moves) => {
          const total = nets.reduce((sum, value) => sum + value, 0);
          nets[0] -= total;

          const ids = nets.map((_, index) => `m${String(index).padStart(3, "0")}`);
          const base = computeBalances(
            nets.map((net, index) => ({
              memberId: ids[index],
              paidPaise: Math.max(0, net),
              fairSharePaise: Math.max(0, -net),
            })),
          );

          // Indices past the end of the member list stand for somebody who has
          // left: the adjustment names a member this month does not have.
          const adjustments = moves.map((move) => ({
            fromMemberId: ids[move.from] ?? `absent-${move.from}`,
            toMemberId: ids[move.to] ?? `absent-${move.to}`,
            amountPaise: move.amountPaise,
          }));

          const adjusted = applyAdjustments(base, adjustments);
          const payments = minimiseTransfers(adjusted);
          const checks = checkSettlement(adjusted, payments);

          expect(checks.netsToZero).toBe(true);
          expect(checks.reconciles).toBe(true);
          expect(checks.transferCount).toBeLessThanOrEqual(checks.maxPossible);
        },
      ),
      { numRuns: 400 },
    );
  });
});
