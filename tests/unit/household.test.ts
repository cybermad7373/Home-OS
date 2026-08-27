import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  SplitError,
  computeSplit,
  payersAmong,
  splitEqual,
  splitPayer,
  splitRoomRent,
  type SplitGuest,
  type SplitParticipant,
  type SplitRoom,
} from "@/lib/domain/expenses/split";

/**
 * The two household shapes.
 *
 * A shared flat is eight equal payers. A family is two or three payers and a
 * number of people who eat the food and pay for none of it. Both go through the
 * same calculator, and the invariant that holds for one has to hold for the
 * other: **shares sum exactly to the amount, always**.
 */

const DATE = "2026-08-23";

function adult(id: string): SplitParticipant {
  return { memberId: id, joinedDate: "2026-01-01", leftDate: null, sharesCost: true };
}

function dependent(id: string, guardianMemberId: string | null): SplitParticipant {
  return {
    memberId: id,
    joinedDate: "2026-01-01",
    leftDate: null,
    sharesCost: false,
    guardianMemberId,
  };
}

function totalOf(
  shares: {
    sharePaise: number;
    guestSharePaise: number;
    dependentSharePaise: number;
  }[],
): number {
  return shares.reduce(
    (sum, share) =>
      sum + share.sharePaise + share.guestSharePaise + share.dependentSharePaise,
    0,
  );
}

describe("payersAmong", () => {
  it("treats an unmarked member as a payer, so nothing existing changes", () => {
    const legacy: SplitParticipant[] = [
      { memberId: "m1", joinedDate: "2026-01-01", leftDate: null },
    ];
    expect(payersAmong(legacy)).toHaveLength(1);
  });

  it("leaves out a resident who does not carry cost", () => {
    const people = [adult("m1"), dependent("d1", "m1")];
    expect(payersAmong(people).map((row) => row.memberId)).toEqual(["m1"]);
  });
});

describe("a family's grocery bill", () => {
  // Two parents, three children. ₹4,200 of shopping feeds five people, and is
  // paid for by two.
  const family = [
    adult("m1"),
    adult("m2"),
    dependent("d1", "m1"),
    dependent("d2", "m1"),
    dependent("d3", "m2"),
  ];

  it("counts every mouth and bills only the guardians", () => {
    const shares = splitEqual({
      amountPaise: 420000,
      expenseDate: DATE,
      basis: "equal",
      members: family,
    });

    // Five heads at ₹840 each.
    expect(shares).toHaveLength(2);
    expect(totalOf(shares)).toBe(420000);

    const first = shares.find((row) => row.memberId === "m1")!;
    const second = shares.find((row) => row.memberId === "m2")!;

    expect(first.sharePaise).toBe(84000);
    expect(first.dependentSharePaise).toBe(168000); // two children
    expect(second.sharePaise).toBe(84000);
    expect(second.dependentSharePaise).toBe(84000); // one child
  });

  it("refuses when nobody present pays", () => {
    expect(() =>
      splitEqual({
        amountPaise: 100000,
        expenseDate: DATE,
        basis: "equal",
        members: [dependent("d1", null)],
      }),
    ).toThrow(SplitError);
  });

  it("drops a head whose guardian has moved out rather than losing the paise", () => {
    // The guardian left in July; the expense is August. Their child is not a
    // head anybody is on the hook for, so they are not counted at all. The
    // alternative — counting them and charging nobody — makes the shares stop
    // adding up to the amount.
    const shares = splitEqual({
      amountPaise: 300000,
      expenseDate: DATE,
      basis: "equal",
      members: [
        adult("m1"),
        { ...adult("m2"), leftDate: "2026-07-31" },
        dependent("d1", "m2"),
      ],
    });

    expect(shares).toHaveLength(1);
    expect(shares[0].sharePaise).toBe(300000);
    expect(totalOf(shares)).toBe(300000);
  });

  it("walks the guardian chain up to somebody who pays", () => {
    // A grandchild in the care of a teenager who is themselves a dependent.
    const shares = splitEqual({
      amountPaise: 300000,
      expenseDate: DATE,
      basis: "equal",
      members: [adult("m1"), dependent("d1", "m1"), dependent("d2", "d1")],
    });

    const payer = shares.find((row) => row.memberId === "m1")!;
    expect(payer.sharePaise).toBe(100000);
    expect(payer.dependentSharePaise).toBe(200000);
    expect(totalOf(shares)).toBe(300000);
  });

  it("survives a guardian cycle instead of looping forever", () => {
    const shares = splitEqual({
      amountPaise: 100000,
      expenseDate: DATE,
      basis: "equal",
      members: [adult("m1"), dependent("d1", "d2"), dependent("d2", "d1")],
    });

    // Neither dependent's chain reaches a payer, so neither is a head.
    expect(shares).toHaveLength(1);
    expect(shares[0].sharePaise).toBe(100000);
  });
});

describe("a guest whose host has left", () => {
  it("is not a head, and the sum still comes out exact", () => {
    // Before the fix this counted in the divisor and was charged to nobody:
    // eight shares of a nine-way split, ₹1,000 short of the amount.
    const guests: SplitGuest[] = [
      {
        guestId: "g1",
        hostMemberId: "gone",
        countsForExpense: true,
        fromDate: DATE,
        toDate: DATE,
      },
    ];

    const shares = splitEqual({
      amountPaise: 900000,
      expenseDate: DATE,
      basis: "equal",
      members: [adult("m1"), adult("m2")],
      guests,
    });

    expect(totalOf(shares)).toBe(900000);
    expect(shares.every((row) => row.guestSharePaise === 0)).toBe(true);
  });
});

describe("pot mode", () => {
  const family = [adult("m1"), adult("m2"), dependent("d1", "m1")];

  it("puts the whole amount on whoever paid", () => {
    const shares = splitPayer({
      amountPaise: 420000,
      expenseDate: DATE,
      basis: "payer",
      members: family,
      paidByMemberId: "m2",
    });

    expect(shares).toEqual([
      {
        memberId: "m2",
        sharePaise: 420000,
        guestSharePaise: 0,
        dependentSharePaise: 0,
      },
    ]);
  });

  it("leaves every member square, so a month of it nets to nothing", () => {
    // The property that makes pot mode work without a second code path
    // anywhere downstream: paid equals fair share for everybody, so the netting
    // algorithm produces no payments at all.
    const paidBy = ["m1", "m2", "m1", "m2", "m1"];
    const amounts = [420000, 130000, 89900, 250000, 1000];

    const paid = new Map<string, number>();
    const owed = new Map<string, number>();

    amounts.forEach((amountPaise, index) => {
      const payer = paidBy[index];
      paid.set(payer, (paid.get(payer) ?? 0) + amountPaise);

      for (const share of splitPayer({
        amountPaise,
        expenseDate: DATE,
        basis: "payer",
        members: family,
        paidByMemberId: payer,
      })) {
        owed.set(share.memberId, (owed.get(share.memberId) ?? 0) + share.sharePaise);
      }
    });

    for (const memberId of ["m1", "m2"]) {
      expect(paid.get(memberId)).toBe(owed.get(memberId));
    }
  });

  it("refuses without a payer, and refuses a payer who was not here", () => {
    const input = {
      amountPaise: 100000,
      expenseDate: DATE,
      basis: "payer" as const,
      members: family,
    };

    expect(() => splitPayer(input)).toThrow(SplitError);
    expect(() => splitPayer({ ...input, paidByMemberId: "nobody" })).toThrow(SplitError);
  });

  it("goes through computeSplit like any other basis", () => {
    const shares = computeSplit({
      amountPaise: 123457,
      expenseDate: DATE,
      basis: "payer",
      members: family,
      paidByMemberId: "m1",
    });
    expect(totalOf(shares)).toBe(123457);
  });
});

describe("rent in a family home", () => {
  it("does not divide a room's rent with the children sleeping in it", () => {
    const rooms: SplitRoom[] = [
      { roomId: "r1", monthlyRentPaise: 1200000, occupantMemberIds: ["m1", "m2"] },
      // The children's room. Nobody in it pays, so its rent is a house cost.
      { roomId: "r2", monthlyRentPaise: 600000, occupantMemberIds: ["d1", "d2"] },
    ];

    const shares = splitRoomRent({
      amountPaise: 1800000,
      expenseDate: DATE,
      basis: "room_rent",
      members: [adult("m1"), adult("m2"), dependent("d1", "m1"), dependent("d2", "m2")],
      rooms,
    });

    expect(shares).toHaveLength(2);
    // ₹12,000 halved, plus half of the ₹6,000 that nobody paying occupies.
    expect(shares.every((row) => row.sharePaise === 900000)).toBe(true);
    expect(totalOf(shares)).toBe(1800000);
  });
});

describe("the invariant, over every household shape", () => {
  it("sums exactly to the amount for any mix of payers, dependents and guests", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_00 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 4 }),
        (amountPaise, payerCount, dependentCount, guestCount) => {
          const payers = Array.from({ length: payerCount }, (_unused, index) =>
            adult(`m${String(index).padStart(3, "0")}`),
          );
          const dependents = Array.from({ length: dependentCount }, (_unused, index) =>
            dependent(
              `d${String(index).padStart(3, "0")}`,
              // Every third dependent hangs off another dependent, exercising
              // the chain walk rather than only the direct case.
              index % 3 === 2 && index > 0
                ? `d${String(index - 1).padStart(3, "0")}`
                : payers[index % payerCount].memberId,
            ),
          );
          const guests: SplitGuest[] = Array.from(
            { length: guestCount },
            (_unused, index) => ({
              guestId: `g${index}`,
              hostMemberId: payers[index % payerCount].memberId,
              countsForExpense: true,
              fromDate: DATE,
              toDate: DATE,
            }),
          );

          const shares = computeSplit({
            amountPaise,
            expenseDate: DATE,
            basis: "equal",
            members: [...payers, ...dependents],
            guests,
          });

          expect(totalOf(shares)).toBe(amountPaise);
          // A dependent never gets a row of their own: they have no money.
          expect(shares.every((row) => row.memberId.startsWith("m"))).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("holds for the payer basis at every amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_00 }), (amountPaise) => {
        const shares = computeSplit({
          amountPaise,
          expenseDate: DATE,
          basis: "payer",
          members: [adult("m1"), adult("m2"), dependent("d1", "m1")],
          paidByMemberId: "m1",
        });
        expect(totalOf(shares)).toBe(amountPaise);
      }),
      { numRuns: 300 },
    );
  });
});
