import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  SplitError,
  computeSplit,
  isActiveOn,
  splitCustom,
  splitEqual,
  splitRoomRent,
  summariseSplit,
  type SplitGuest,
  type SplitParticipant,
  type SplitRoom,
} from "@/lib/domain/expenses/split";

/**
 * The phase-2 property from docs/02-TRD.md section 9:
 *
 *   "Splits always sum to the expense amount, for any member count and any
 *    rounding remainder."
 *
 * Everything else in this file is a worked example from the algorithms document
 * or an edge case from the business rules.
 */

const DATE = "2026-08-23";

function members(count: number, joined = "2026-01-01"): SplitParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    // Padded so that string ordering matches numeric ordering — the remainder
    // rule is "ascending member id", and these ids stand in for uuids.
    memberId: `m${String(index).padStart(3, "0")}`,
    joinedDate: joined,
    leftDate: null,
  }));
}

function totalOf(shares: { sharePaise: number; guestSharePaise: number }[]): number {
  return shares.reduce((sum, share) => sum + share.sharePaise + share.guestSharePaise, 0);
}

describe("equal split", () => {
  it("matches the worked example: ₹1,240 across 8 members and 1 guest", () => {
    const eight = members(8);
    const guest: SplitGuest = {
      guestId: "g1",
      hostMemberId: "m004",
      countsForExpense: true,
      fromDate: DATE,
      toDate: DATE,
    };

    const shares = splitEqual({
      amountPaise: 124000,
      expenseDate: DATE,
      basis: "equal",
      members: eight,
      guests: [guest],
    });

    // 9 heads, base 13,777 paise, 7 paise remainder to the first seven members.
    expect(shares).toHaveLength(8);
    expect(shares.slice(0, 7).every((share) => share.sharePaise === 13778)).toBe(true);
    expect(shares[7].sharePaise).toBe(13777);

    const host = shares.find((share) => share.memberId === "m004")!;
    expect(host.guestSharePaise).toBe(13777);
    expect(host.sharePaise + host.guestSharePaise).toBe(27555); // ₹275.55

    expect(totalOf(shares)).toBe(124000);
  });

  it("gives the whole amount to a household of one", () => {
    const shares = splitEqual({
      amountPaise: 12345,
      expenseDate: DATE,
      basis: "equal",
      members: members(1),
    });
    expect(shares[0].sharePaise).toBe(12345);
  });

  it("hands out the remainder one paisa at a time, in id order", () => {
    const shares = splitEqual({
      amountPaise: 100,
      expenseDate: DATE,
      basis: "equal",
      members: members(3),
    });
    expect(shares.map((share) => share.sharePaise)).toEqual([34, 33, 33]);
  });

  it("refuses when nobody was a member on the date", () => {
    expect(() =>
      splitEqual({
        amountPaise: 1000,
        expenseDate: "2025-01-01",
        basis: "equal",
        members: members(3, "2026-01-01"),
      }),
    ).toThrow(SplitError);
  });

  it("ignores a guest whose host has left", () => {
    const shares = splitEqual({
      amountPaise: 1000,
      expenseDate: DATE,
      basis: "equal",
      members: members(2),
      guests: [
        {
          guestId: "g1",
          hostMemberId: "gone",
          countsForExpense: true,
          fromDate: DATE,
          toDate: DATE,
        },
      ],
    });
    expect(totalOf(shares)).toBeLessThanOrEqual(1000);
  });
});

describe("dated membership (BR-005)", () => {
  const member: SplitParticipant = {
    memberId: "m1",
    joinedDate: "2026-03-01",
    leftDate: "2026-07-31",
  };

  it("includes somebody on a date inside their window", () => {
    expect(isActiveOn(member, "2026-07-18")).toBe(true);
  });

  it("excludes them before they joined and after they left", () => {
    expect(isActiveOn(member, "2026-02-28")).toBe(false);
    expect(isActiveOn(member, "2026-08-01")).toBe(false);
  });

  it("still bills a July expense to somebody who left in July", () => {
    const shares = splitEqual({
      amountPaise: 1000,
      expenseDate: "2026-07-18",
      basis: "equal",
      members: [member, { memberId: "m2", joinedDate: "2026-01-01", leftDate: null }],
    });
    expect(shares).toHaveLength(2);
    expect(totalOf(shares)).toBe(1000);
  });
});

describe("room-rent split", () => {
  const rooms: SplitRoom[] = [
    { roomId: "r1", monthlyRentPaise: 900000, occupantMemberIds: ["m000", "m001", "m002"] },
    { roomId: "r2", monthlyRentPaise: 900000, occupantMemberIds: ["m003", "m004", "m005"] },
    { roomId: "r3", monthlyRentPaise: 700000, occupantMemberIds: ["m006", "m007"] },
  ];

  it("matches the worked example: ₹25,000 over three rooms", () => {
    const shares = splitRoomRent({
      amountPaise: 2500000,
      expenseDate: DATE,
      basis: "room_rent",
      members: members(8),
      rooms,
    });

    const by = (id: string) => shares.find((share) => share.memberId === id)!.sharePaise;
    expect(by("m000")).toBe(300000); // ₹3,000
    expect(by("m006")).toBe(350000); // ₹3,500
    expect(totalOf(shares)).toBe(2500000);
  });

  it("spreads a vacant room's rent across everybody (BR-013)", () => {
    const withVacancy: SplitRoom[] = [
      { roomId: "r1", monthlyRentPaise: 900000, occupantMemberIds: ["m000", "m001"] },
      { roomId: "r2", monthlyRentPaise: 600000, occupantMemberIds: [] },
    ];

    const shares = splitRoomRent({
      amountPaise: 1500000,
      expenseDate: DATE,
      basis: "room_rent",
      members: members(4),
      rooms: withVacancy,
    });

    // Occupants of r1 pay their own rent plus a quarter of the empty room.
    const by = (id: string) => shares.find((share) => share.memberId === id)!.sharePaise;
    expect(by("m000")).toBe(450000 + 150000);
    expect(by("m002")).toBe(150000);
    expect(totalOf(shares)).toBe(1500000);
  });

  it("leaves a member with no room out of room rent but in the equal remainder (BR-015)", () => {
    const shares = splitRoomRent({
      amountPaise: 900000,
      expenseDate: DATE,
      basis: "room_rent",
      members: members(3),
      rooms: [
        { roomId: "r1", monthlyRentPaise: 900000, occupantMemberIds: ["m000", "m001"] },
      ],
    });

    const roomless = shares.find((share) => share.memberId === "m002")!;
    expect(roomless.sharePaise).toBe(0);
    expect(totalOf(shares)).toBe(900000);
  });

  it("still sums exactly when the logged amount differs from the configured rents", () => {
    const shares = splitRoomRent({
      amountPaise: 2500123, // the landlord asked for a little more this month
      expenseDate: DATE,
      basis: "room_rent",
      members: members(8),
      rooms,
    });
    expect(totalOf(shares)).toBe(2500123);
  });

  it("refuses when no room has rent set", () => {
    expect(() =>
      splitRoomRent({
        amountPaise: 1000,
        expenseDate: DATE,
        basis: "room_rent",
        members: members(2),
        rooms: [{ roomId: "r1", monthlyRentPaise: 0, occupantMemberIds: ["m000"] }],
      }),
    ).toThrow(SplitError);
  });
});

describe("custom split (BR-094)", () => {
  const three = members(3);

  it("accepts amounts that add up exactly", () => {
    const shares = splitCustom({
      amountPaise: 1000,
      expenseDate: DATE,
      basis: "custom",
      members: three,
      customShares: [
        { memberId: "m000", sharePaise: 500 },
        { memberId: "m001", sharePaise: 300 },
        { memberId: "m002", sharePaise: 200 },
      ],
    });
    expect(totalOf(shares)).toBe(1000);
  });

  it("states the difference when they do not", () => {
    try {
      splitCustom({
        amountPaise: 1000,
        expenseDate: DATE,
        basis: "custom",
        members: three,
        customShares: [{ memberId: "m000", sharePaise: 900 }],
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SplitError);
      expect((error as SplitError).code).toBe("CUSTOM_MISMATCH");
      expect((error as SplitError).details?.difference).toBe(100);
    }
  });

  it("refuses a negative share", () => {
    expect(() =>
      splitCustom({
        amountPaise: 1000,
        expenseDate: DATE,
        basis: "custom",
        members: three,
        customShares: [
          { memberId: "m000", sharePaise: 1100 },
          { memberId: "m001", sharePaise: -100 },
        ],
      }),
    ).toThrow(SplitError);
  });

  it("refuses somebody who was not a member on the date", () => {
    expect(() =>
      splitCustom({
        amountPaise: 1000,
        expenseDate: DATE,
        basis: "custom",
        members: three,
        customShares: [{ memberId: "stranger", sharePaise: 1000 }],
      }),
    ).toThrow(SplitError);
  });
});

describe("the property that must hold", () => {
  it("sums exactly, for ₹0.01 to ₹10,00,000 across 1 to 30 members", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000000 }),
        fc.integer({ min: 1, max: 30 }),
        (amountPaise, headCount) => {
          const shares = computeSplit({
            amountPaise,
            expenseDate: DATE,
            basis: "equal",
            members: members(headCount),
          });
          expect(totalOf(shares)).toBe(amountPaise);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("sums exactly with guests in the mix", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000000 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 5 }),
        (amountPaise, headCount, guestCount) => {
          const roster = members(headCount);
          const guests: SplitGuest[] = Array.from({ length: guestCount }, (_, index) => ({
            guestId: `g${index}`,
            hostMemberId: roster[index % roster.length].memberId,
            countsForExpense: true,
            fromDate: DATE,
            toDate: DATE,
          }));

          const shares = computeSplit({
            amountPaise,
            expenseDate: DATE,
            basis: "equal",
            members: roster,
            guests,
          });
          expect(totalOf(shares)).toBe(amountPaise);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("sums exactly for room rent, whatever the rents and occupancy", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000000 }),
        fc.array(fc.integer({ min: 0, max: 5000000 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 12 }),
        (amountPaise, rents, headCount) => {
          const roster = members(headCount);
          const rooms: SplitRoom[] = rents.map((rent, index) => ({
            roomId: `r${index}`,
            monthlyRentPaise: rent,
            occupantMemberIds: roster
              .filter((_, memberIndex) => memberIndex % rents.length === index)
              .map((member) => member.memberId),
          }));

          if (rooms.every((room) => room.monthlyRentPaise === 0)) return;

          const shares = computeSplit({
            amountPaise,
            expenseDate: DATE,
            basis: "room_rent",
            members: roster,
            rooms,
          });
          expect(totalOf(shares)).toBe(amountPaise);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never produces a negative share on an equal split", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000000 }),
        fc.integer({ min: 1, max: 30 }),
        (amountPaise, headCount) => {
          const shares = computeSplit({
            amountPaise,
            expenseDate: DATE,
            basis: "equal",
            members: members(headCount),
          });
          expect(shares.every((share) => share.sharePaise >= 0)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("summariseSplit", () => {
  it("reports the caller's own share and the head count", () => {
    const shares = splitEqual({
      amountPaise: 124000,
      expenseDate: DATE,
      basis: "equal",
      members: members(8),
      guests: [
        {
          guestId: "g1",
          hostMemberId: "m004",
          countsForExpense: true,
          fromDate: DATE,
          toDate: DATE,
        },
      ],
    });

    // The one guest is a head the split has no row for, so the caller passes
    // the count in. Deriving it from the rows would undercount a host with two.
    expect(summariseSplit(shares, "m004", 1)).toEqual({
      yourSharePaise: 27555,
      heads: 9,
      carriedHeads: 1,
    });
  });
});
