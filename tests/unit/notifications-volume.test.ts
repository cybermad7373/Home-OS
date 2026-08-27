import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MAX_PUSH_PER_DAY,
  allocate,
  collapseByTag,
  digestFor,
  effectivePriority,
  limitEscalations,
  type Candidate,
} from "@/lib/domain/notifications/volume";
import { PRIORITY, pushAllowed, entryFor, MANDATORY } from "@/lib/domain/notifications/catalogue";
import type { NotificationType } from "@/lib/domain/notifications/catalogue";

/**
 * Phase 7 — the volume control of docs/11-NOTIFICATIONS-SPEC.md section 5, and
 * the tests section 9 names:
 *
 *   "The seventh notification in a day is coalesced, not sent."
 *   "Two reminders for the same chore produce one visible notification."
 *   "A disabled category produces no push, but still produces a feed row."
 *
 * These limits are what keep the app installed. They are not decorative and the
 * spec says so in as many words.
 */

let sequence = 0;

function candidate(
  type: NotificationType,
  overrides: Partial<Candidate> = {},
): Candidate {
  sequence += 1;
  return {
    id: `n${sequence}`,
    type,
    title: `${type} title`,
    body: "body",
    deepLink: "/chores",
    tag: `tag-${sequence}`,
    scheduledForMin: 0,
    ...overrides,
  };
}

describe("priority", () => {
  it("puts settlement first and everything ordinary last", () => {
    expect(effectivePriority(candidate("N-22"), 0)).toBe(PRIORITY.SETTLEMENT);
    expect(effectivePriority(candidate("N-06"), 0)).toBe(PRIORITY.CONFIRMATION);
    expect(effectivePriority(candidate("N-18"), 0)).toBe(PRIORITY.APPROVAL);
    expect(effectivePriority(candidate("N-27"), 0)).toBe(PRIORITY.OTHER);
  });

  it("promotes a reminder only while its window is within the hour", () => {
    const soon = candidate("N-02", { windowStartMin: 30 });
    const later = candidate("N-02", { windowStartMin: 600 });

    expect(effectivePriority(soon, 0)).toBe(PRIORITY.IMMINENT_REMINDER);
    expect(effectivePriority(later, 0)).toBe(PRIORITY.OTHER);
  });
});

describe("duplicate suppression", () => {
  it("keeps the later of two rows sharing a tag inside ten minutes", () => {
    const first = candidate("N-02", { tag: "chore-1", scheduledForMin: 100, title: "old" });
    const second = candidate("N-02", { tag: "chore-1", scheduledForMin: 105, title: "new" });

    const kept = collapseByTag([first, second]);
    expect(kept).toHaveLength(1);
    // The fresher row wins: it knows the deadline moved and the first does not.
    expect(kept[0].title).toBe("new");
  });

  it("leaves the same tag alone once the window has passed", () => {
    const first = candidate("N-02", { tag: "chore-1", scheduledForMin: 100 });
    const second = candidate("N-03", { tag: "chore-1", scheduledForMin: 200 });
    expect(collapseByTag([first, second])).toHaveLength(2);
  });

  it("never invents a row", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            tag: fc.constantFrom("a", "b", "c"),
            scheduledForMin: fc.integer({ min: 0, max: 200 }),
          }),
          { maxLength: 20 },
        ),
        (rows) => {
          const candidates = rows.map((row) => candidate("N-02", row));
          expect(collapseByTag(candidates).length).toBeLessThanOrEqual(candidates.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("the daily cap", () => {
  it("sends everything when there is room", () => {
    const due = [candidate("N-02"), candidate("N-06"), candidate("N-18")];
    const { push, digest } = allocate(due, 0, 0);

    expect(push).toHaveLength(3);
    expect(digest).toBeNull();
  });

  it("coalesces the seventh rather than sending it", () => {
    const due = Array.from({ length: 7 }, () => candidate("N-27"));
    const { push, digest } = allocate(due, 0, 0);

    // Five individually plus one digest is six pushes — the cap, not the cap
    // plus one. A digest that pushed the total to seven would defeat the rule
    // it exists to serve.
    expect(push).toHaveLength(MAX_PUSH_PER_DAY - 1);
    expect(digest).not.toBeNull();
    expect(digest?.folded).toHaveLength(2);
    expect(push.length + 1).toBeLessThanOrEqual(MAX_PUSH_PER_DAY);
  });

  it("counts what earlier runs already spent", () => {
    const due = [candidate("N-27"), candidate("N-27"), candidate("N-27")];
    const { push, digest } = allocate(due, 0, 5);

    // One left in the allowance, and three things wanting it: the one goes to
    // the digest.
    expect(push).toHaveLength(0);
    expect(digest?.folded).toHaveLength(3);
  });

  it("gives the surviving slots to the highest priority", () => {
    const due = [
      ...Array.from({ length: 6 }, () => candidate("N-27")),
      candidate("N-22", { title: "settlement" }),
    ];
    const { push } = allocate(due, 0, 0);

    expect(push[0].title).toBe("settlement");
  });

  it("never pushes more than the cap, for any arrival pattern", () => {
    const types: NotificationType[] = ["N-02", "N-06", "N-18", "N-22", "N-27"];

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...types), { maxLength: 30 }),
        fc.integer({ min: 0, max: MAX_PUSH_PER_DAY }),
        (chosen, spent) => {
          const due = chosen.map((type) => candidate(type));
          const { push, digest } = allocate(due, 0, spent);
          const total = push.length + (digest ? 1 : 0);
          expect(total).toBeLessThanOrEqual(Math.max(0, MAX_PUSH_PER_DAY - spent));
        },
      ),
      { numRuns: 300 },
    );
  });

  it("loses nothing: every candidate is pushed or folded", () => {
    const types: NotificationType[] = ["N-02", "N-06", "N-18", "N-22", "N-27"];

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...types), { minLength: 1, maxLength: 25 }),
        fc.integer({ min: 0, max: MAX_PUSH_PER_DAY }),
        (chosen, spent) => {
          const due = chosen.map((type) => candidate(type));
          const { push, folded } = allocate(due, 0, spent);
          expect(push.length + folded.length).toBe(collapseByTag(due).length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("sends nothing at all once the allowance is spent", () => {
    // Not even a digest. The seventh push is the seventh push whatever it says,
    // and the rows are still written to the feed either way.
    const { push, digest, folded } = allocate([candidate("N-02")], 0, MAX_PUSH_PER_DAY);

    expect(push).toHaveLength(0);
    expect(digest).toBeNull();
    expect(folded).toHaveLength(1);
  });
});

describe("the coalesced digest", () => {
  it("says how many things need you and links to the feed", () => {
    const digest = digestFor([candidate("N-06"), candidate("N-18"), candidate("N-27")]);
    expect(digest.title).toBe("3 things need you");
    expect(digest.deepLink).toBe("/notifications");
  });

  it("gets its number right for one", () => {
    expect(digestFor([candidate("N-06")]).title).toBe("1 thing needs you");
  });
});

describe("escalation limits", () => {
  it("allows one house post per member per day, whatever they missed", () => {
    const misses = [
      { subjectMemberId: "ravi" },
      { subjectMemberId: "ravi" },
      { subjectMemberId: "kumar" },
    ];
    const kept = limitEscalations(misses, new Map());

    expect(kept).toHaveLength(2);
    expect(kept.map((row) => row.subjectMemberId)).toEqual(["ravi", "kumar"]);
  });

  it("respects an escalation that already went out today", () => {
    const kept = limitEscalations(
      [{ subjectMemberId: "ravi" }],
      new Map([["ravi", 1]]),
    );
    expect(kept).toHaveLength(0);
  });
});

describe("preferences", () => {
  it("silences a category that is switched off", () => {
    expect(pushAllowed("N-18", { expense_activity: false })).toBe(false);
    expect(pushAllowed("N-18", { expense_activity: true })).toBe(true);
    expect(pushAllowed("N-18", {})).toBe(true);
  });

  it("refuses to silence settlement", () => {
    for (const type of ["N-22", "N-23", "N-24", "N-25", "N-26"] as NotificationType[]) {
      expect(entryFor(type).category).toBe("settlement_updates");
      expect(pushAllowed(type, { settlement_updates: false })).toBe(true);
    }
    expect(MANDATORY).toContain("settlement_updates");
  });

  it("exempts settlement from quiet hours and nothing else", () => {
    const exempt = (Object.keys({
      "N-01": 0, "N-02": 0, "N-03": 0, "N-04": 0, "N-05": 0, "N-06": 0, "N-07": 0,
      "N-08": 0, "N-09": 0, "N-10": 0, "N-11": 0, "N-12": 0, "N-13": 0, "N-14": 0,
      "N-15": 0, "N-16": 0, "N-17": 0, "N-18": 0, "N-19": 0, "N-20": 0, "N-21": 0,
      "N-22": 0, "N-23": 0, "N-24": 0, "N-25": 0, "N-26": 0, "N-27": 0, "N-28": 0,
      "N-29": 0, "N-30": 0,
    }) as NotificationType[]).filter((type) => entryFor(type).quietHoursExempt);

    expect(exempt).toEqual(["N-22", "N-23", "N-24", "N-25", "N-26"]);
  });
});
