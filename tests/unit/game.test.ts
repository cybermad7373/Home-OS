import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  BADGES,
  badgesFor,
  buildStandings,
  standingFor,
  type ConfirmedChore,
} from "@/lib/domain/game";

/**
 * The game layer.
 *
 * The screen these feed used to render invented numbers — a literal 7-day
 * streak for everybody, and per-member points derived from the character codes
 * of a UUID. These tests exist so the replacement cannot quietly drift back
 * into being decorative: every figure has to come from a confirmed chore.
 */

function chore(memberId: string, choreDate: string, points = 10): ConfirmedChore {
  return { memberId, choreDate, points };
}

describe("standingFor", () => {
  it("gives a member with no confirmed chores a zero of every kind", () => {
    const standing = standingFor("m1", [], "2026-09-03");

    expect(standing).toEqual({
      memberId: "m1",
      points: 0,
      currentStreak: 0,
      bestStreak: 0,
      activeDays: 0,
      lastActiveDate: null,
    });
  });

  it("counts a day once however many chores were confirmed on it", () => {
    const standing = standingFor(
      "m1",
      [
        chore("m1", "2026-09-03", 5),
        chore("m1", "2026-09-03", 5),
        chore("m1", "2026-09-03", 5),
        chore("m1", "2026-09-03", 5),
      ],
      "2026-09-03",
    );

    // Four things on one day is one day, not a four-day streak.
    expect(standing.activeDays).toBe(1);
    expect(standing.currentStreak).toBe(1);
    expect(standing.bestStreak).toBe(1);
    // The points, unlike the days, do all count.
    expect(standing.points).toBe(20);
  });

  it("counts consecutive days and stops at the gap", () => {
    const standing = standingFor(
      "m1",
      [
        chore("m1", "2026-08-30"),
        // gap on the 31st
        chore("m1", "2026-09-01"),
        chore("m1", "2026-09-02"),
        chore("m1", "2026-09-03"),
      ],
      "2026-09-03",
    );

    expect(standing.currentStreak).toBe(3);
    expect(standing.bestStreak).toBe(3);
    expect(standing.activeDays).toBe(4);
  });

  it("keeps a streak alive on the day after the last chore, and ends it after that", () => {
    const chores = [chore("m1", "2026-09-01"), chore("m1", "2026-09-02")];

    // Today is not over yet: the streak stands.
    expect(standingFor("m1", chores, "2026-09-03").currentStreak).toBe(2);
    // A day later, it is genuinely broken.
    expect(standingFor("m1", chores, "2026-09-04").currentStreak).toBe(0);
    // And the record of it survives.
    expect(standingFor("m1", chores, "2026-09-04").bestStreak).toBe(2);
  });

  it("crosses a month boundary", () => {
    const standing = standingFor(
      "m1",
      [
        chore("m1", "2026-08-30"),
        chore("m1", "2026-08-31"),
        chore("m1", "2026-09-01"),
      ],
      "2026-09-01",
    );

    expect(standing.currentStreak).toBe(3);
  });

  it("crosses a leap day", () => {
    const standing = standingFor(
      "m1",
      [
        chore("m1", "2028-02-28"),
        chore("m1", "2028-02-29"),
        chore("m1", "2028-03-01"),
      ],
      "2028-03-01",
    );

    expect(standing.currentStreak).toBe(3);
  });

  it("ignores other members' chores entirely", () => {
    const chores = [
      chore("m1", "2026-09-01", 10),
      chore("m2", "2026-09-02", 90),
      chore("m2", "2026-09-03", 90),
    ];

    expect(standingFor("m1", chores, "2026-09-03").points).toBe(10);
    expect(standingFor("m1", chores, "2026-09-03").currentStreak).toBe(0);
    expect(standingFor("m2", chores, "2026-09-03").points).toBe(180);
    expect(standingFor("m2", chores, "2026-09-03").currentStreak).toBe(2);
  });

  it("does not depend on the order the records arrive in", () => {
    const ordered = [
      chore("m1", "2026-09-01"),
      chore("m1", "2026-09-02"),
      chore("m1", "2026-09-03"),
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];

    expect(standingFor("m1", shuffled, "2026-09-03")).toEqual(
      standingFor("m1", ordered, "2026-09-03"),
    );
  });
});

describe("buildStandings", () => {
  it("answers for every member asked about, in the order asked", () => {
    const standings = buildStandings(
      ["m3", "m1", "m2"],
      [chore("m1", "2026-09-03")],
      "2026-09-03",
    );

    expect(standings.map((standing) => standing.memberId)).toEqual(["m3", "m1", "m2"]);
    expect(standings[1].activeDays).toBe(1);
    expect(standings[0].activeDays).toBe(0);
  });
});

describe("badgesFor", () => {
  it("earns nothing on an empty standing", () => {
    const badges = badgesFor(standingFor("m1", [], "2026-09-03"));

    expect(badges).toHaveLength(BADGES.length);
    expect(badges.every((badge) => !badge.earned)).toBe(true);
  });

  it("earns the first-chore badge on the first confirmed chore", () => {
    const badges = badgesFor(
      standingFor("m1", [chore("m1", "2026-09-03")], "2026-09-03"),
    );

    expect(badges.find((badge) => badge.key === "first")?.earned).toBe(true);
    expect(badges.find((badge) => badge.key === "week")?.earned).toBe(false);
  });

  it("earns the week badge on a seventh consecutive day", () => {
    const week = Array.from({ length: 7 }, (_, index) =>
      chore("m1", `2026-09-0${index + 1}`),
    );

    expect(
      badgesFor(standingFor("m1", week, "2026-09-07")).find(
        (badge) => badge.key === "week",
      )?.earned,
    ).toBe(true);
  });
});

describe("properties", () => {
  const dayArb = fc
    .integer({ min: 0, max: 900 })
    .map((offset) => {
      const at = new Date(Date.UTC(2026, 0, 1, 12));
      at.setUTCDate(at.getUTCDate() + offset);
      return at.toISOString().slice(0, 10);
    });

  it("never reports a current streak longer than the best one", () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 60 }), (days) => {
        const standing = standingFor(
          "m1",
          days.map((day) => chore("m1", day)),
          "2027-01-01",
        );
        expect(standing.currentStreak).toBeLessThanOrEqual(standing.bestStreak);
      }),
    );
  });

  it("never reports more active days than there are distinct dates", () => {
    fc.assert(
      fc.property(fc.array(dayArb, { maxLength: 60 }), (days) => {
        const standing = standingFor(
          "m1",
          days.map((day) => chore("m1", day)),
          "2027-01-01",
        );
        expect(standing.activeDays).toBe(new Set(days).size);
        expect(standing.bestStreak).toBeLessThanOrEqual(standing.activeDays);
      }),
    );
  });

  it("totals the points of every record it was given", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(dayArb, fc.integer({ min: 0, max: 200 })), {
          maxLength: 60,
        }),
        (rows) => {
          const standing = standingFor(
            "m1",
            rows.map(([day, points]) => chore("m1", day, points)),
            "2027-01-01",
          );
          expect(standing.points).toBe(
            rows.reduce((total, [, points]) => total + points, 0),
          );
        },
      ),
    );
  });
});
