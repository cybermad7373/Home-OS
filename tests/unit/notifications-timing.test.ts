import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DEFAULT_QUIET_HOURS,
  MINUTES_PER_DAY,
  REMINDER_LEAD_MIN,
  deadlineReminderTime,
  formatClock,
  inQuietHours,
  nextAllowedMinute,
  parseClock,
  quietHoursFrom,
  reminderTime,
  snoozeTime,
  type QuietHours,
} from "@/lib/domain/notifications/timing";

/**
 * Phase 7 — the timing rules of docs/11-NOTIFICATIONS-SPEC.md section 3, and
 * the tests section 9 asks for:
 *
 *   "A chore reminder scheduled for 23:30 is delivered at 07:00, not 23:30."
 *   "A member returning at 22:00 receives their evening reminder after 22:00,
 *    never at 21:30."
 *
 * Minutes, not dates. A value past 1440 means the following day, which is what
 * lets a suppressed 23:30 reminder resolve to 07:00 tomorrow without any date
 * arithmetic entering a rule that has nothing to do with dates.
 */

const at = (hours: number, minutes = 0) => hours * 60 + minutes;

describe("quiet hours", () => {
  it("wraps midnight", () => {
    expect(inQuietHours(at(23, 30), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(inQuietHours(at(2), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(inQuietHours(at(6, 59), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(inQuietHours(at(7), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(inQuietHours(at(19), DEFAULT_QUIET_HOURS)).toBe(false);
  });

  it("treats a non-wrapping window as an ordinary range", () => {
    const midday: QuietHours = { startMin: at(13), endMin: at(15) };
    expect(inQuietHours(at(14), midday)).toBe(true);
    expect(inQuietHours(at(15), midday)).toBe(false);
    expect(inQuietHours(at(12, 59), midday)).toBe(false);
  });

  it("treats equal ends as quiet hours turned off, not as a silent day", () => {
    const none: QuietHours = { startMin: at(9), endMin: at(9) };
    for (const minute of [0, at(9), at(12), at(23, 59)]) {
      expect(inQuietHours(minute, none)).toBe(false);
    }
  });

  it("moves a suppressed notification to the end of quiet hours", () => {
    // The spec's own case: scheduled 23:30, delivered 07:00 the next morning.
    expect(nextAllowedMinute(at(23, 30), DEFAULT_QUIET_HOURS)).toBe(
      MINUTES_PER_DAY + at(7),
    );
    // And one already inside the small hours waits only until the morning.
    expect(nextAllowedMinute(at(2), DEFAULT_QUIET_HOURS)).toBe(at(7));
  });

  it("leaves an allowed instant exactly where it is", () => {
    expect(nextAllowedMinute(at(19, 15), DEFAULT_QUIET_HOURS)).toBe(at(19, 15));
    expect(nextAllowedMinute(at(19, 15), null)).toBe(at(19, 15));
  });

  it("never returns an instant that is itself inside quiet hours", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MINUTES_PER_DAY * 2 }),
        fc.integer({ min: 0, max: MINUTES_PER_DAY - 1 }),
        fc.integer({ min: 0, max: MINUTES_PER_DAY - 1 }),
        (minute, start, end) => {
          const quiet: QuietHours = { startMin: start, endMin: end };
          const moved = nextAllowedMinute(minute, quiet);
          expect(inQuietHours(moved, quiet)).toBe(false);
          expect(moved).toBeGreaterThanOrEqual(minute);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("reminderTime", () => {
  it("is thirty minutes ahead when nothing is in the way", () => {
    expect(
      reminderTime({
        windowStartMin: at(19, 30),
        deadlineMin: at(22),
        returnsAtMin: null,
        quiet: DEFAULT_QUIET_HOURS,
      }),
    ).toBe(at(19));
  });

  it("waits until the member is home — the spec's worked example", () => {
    // Suresh returns at 22:00. Window 22:00–23:00, deadline 23:00. The naive
    // 21:30 would reach him on the bus; the rule moves it to 22:05.
    expect(
      reminderTime({
        windowStartMin: at(22),
        deadlineMin: at(23),
        returnsAtMin: at(22),
        quiet: DEFAULT_QUIET_HOURS,
      }),
    ).toBe(at(22, 5));
  });

  it("never fires before somebody gets home, for any window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: at(6), max: at(22) }),
        fc.integer({ min: at(5), max: at(23) }),
        (windowStart, returnsAt) => {
          const deadline = Math.min(windowStart + 120, at(23, 59));
          const reminder = reminderTime({
            windowStartMin: windowStart,
            deadlineMin: deadline,
            returnsAtMin: returnsAt,
            quiet: null,
          });

          // Either it is after they are home, or the deadline clamp pulled it
          // back to the window itself — which is the one case the spec allows,
          // because a late reminder about a doable chore beats silence.
          expect(reminder >= returnsAt || reminder === windowStart).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("falls back to the window start rather than reminding after the deadline", () => {
    // A member who gets home at 23:00 with a deadline at 23:30: settling in
    // plus quiet hours would push the reminder to 07:00 tomorrow, long past the
    // chore. The clamp brings it back to the window.
    const reminder = reminderTime({
      windowStartMin: at(23),
      deadlineMin: at(23, 30),
      returnsAtMin: at(23),
      quiet: DEFAULT_QUIET_HOURS,
    });
    expect(reminder).toBe(at(23));
  });

  it("does not move a reminder that is already outside quiet hours", () => {
    const reminder = reminderTime({
      windowStartMin: at(8),
      deadlineMin: at(10),
      returnsAtMin: null,
      quiet: DEFAULT_QUIET_HOURS,
    });
    expect(reminder).toBe(at(8) - REMINDER_LEAD_MIN);
    expect(inQuietHours(reminder, DEFAULT_QUIET_HOURS)).toBe(false);
  });
});

describe("the second reminder", () => {
  const input = {
    windowStartMin: at(18),
    deadlineMin: at(22),
    returnsAtMin: null,
    quiet: DEFAULT_QUIET_HOURS,
  };

  it("lands two hours before the deadline", () => {
    const first = reminderTime(input);
    expect(deadlineReminderTime(input, first)).toBe(at(20));
  });

  it("is dropped when it would crowd the first one", () => {
    // A one-hour window: the deadline reminder would arrive before the window
    // opens, which is the first reminder wearing a different hat.
    const short = { ...input, windowStartMin: at(21), deadlineMin: at(22) };
    const first = reminderTime(short);
    expect(deadlineReminderTime(short, first)).toBeNull();
  });

  it("is never scheduled after the deadline it is warning about", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: at(6), max: at(20) }),
        fc.integer({ min: 30, max: 300 }),
        (windowStart, length) => {
          const candidate = {
            windowStartMin: windowStart,
            deadlineMin: windowStart + length,
            returnsAtMin: null,
            quiet: DEFAULT_QUIET_HOURS,
          };
          const second = deadlineReminderTime(candidate, reminderTime(candidate));
          if (second !== null) expect(second).toBeLessThan(candidate.deadlineMin);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("snoozing", () => {
  it("adds an hour, twice, and then refuses", () => {
    expect(snoozeTime(at(19), 0, null)).toBe(at(20));
    expect(snoozeTime(at(20), 1, null)).toBe(at(21));
    expect(snoozeTime(at(21), 2, null)).toBeNull();
  });

  it("respects quiet hours on the way", () => {
    expect(snoozeTime(at(22, 30), 0, DEFAULT_QUIET_HOURS)).toBe(MINUTES_PER_DAY + at(7));
  });
});

describe("clock parsing", () => {
  it("reads both forms Postgres hands back", () => {
    expect(parseClock("23:00")).toBe(at(23));
    expect(parseClock("07:00:00")).toBe(at(7));
    expect(parseClock(null)).toBeNull();
  });

  it("round-trips", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MINUTES_PER_DAY - 1 }), (minute) => {
        expect(parseClock(formatClock(minute))).toBe(minute);
      }),
    );
  });

  it("treats a half-specified window as no window at all", () => {
    expect(quietHoursFrom("23:00", null)).toBeNull();
    expect(quietHoursFrom(null, "07:00")).toBeNull();
    expect(quietHoursFrom("23:00", "07:00")).toEqual(DEFAULT_QUIET_HOURS);
  });
});
