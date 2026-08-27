import { describe, expect, it } from "vitest";
import { advanceRunDate, isDue, nextRunDate } from "@/lib/domain/expenses/recurring";

/** BR-096 to BR-098 — recurring expense scheduling. */

describe("nextRunDate", () => {
  it("stays in this month when the day has not passed", () => {
    expect(nextRunDate(15, "Asia/Kolkata", "2026-08-05")).toBe("2026-08-15");
  });

  it("uses today when today is the day", () => {
    expect(nextRunDate(5, "Asia/Kolkata", "2026-08-05")).toBe("2026-08-05");
  });

  it("rolls into next month once the day has passed", () => {
    expect(nextRunDate(1, "Asia/Kolkata", "2026-08-05")).toBe("2026-09-01");
  });

  it("rolls across the year boundary", () => {
    expect(nextRunDate(1, "Asia/Kolkata", "2026-12-05")).toBe("2027-01-01");
  });

  it("never produces a day a month cannot have, because 28 is the cap", () => {
    // February is the case the cap exists for.
    expect(nextRunDate(28, "Asia/Kolkata", "2027-02-01")).toBe("2027-02-28");
  });
});

describe("advanceRunDate", () => {
  it("moves to the same day next month", () => {
    expect(advanceRunDate("2026-08-15")).toBe("2026-09-15");
  });

  it("wraps December into January", () => {
    expect(advanceRunDate("2026-12-28")).toBe("2027-01-28");
  });
});

describe("isDue", () => {
  const definition = { active: true, next_run_date: "2026-08-15" };

  it("is due on its date", () => {
    expect(isDue(definition, "2026-08-15")).toBe(true);
  });

  it("is not due before it", () => {
    expect(isDue(definition, "2026-08-14")).toBe(false);
  });

  it("is still due after a missed day, so a failed run catches up (NFR-07)", () => {
    expect(isDue(definition, "2026-08-19")).toBe(true);
  });

  it("is never due while paused (BR-098)", () => {
    expect(isDue({ ...definition, active: false }, "2026-08-20")).toBe(false);
  });
});
