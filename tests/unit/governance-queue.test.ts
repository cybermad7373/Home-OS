import { describe, expect, it } from "vitest";
import {
  GROUP_OF,
  GROUP_ORDER,
  awaitsResponse,
  needsDeliberateAction,
  splitQueue,
  type QueueItem,
} from "@/lib/domain/governance/queue";
import type { DecisionType } from "@/lib/domain/governance/types";

/**
 * The Approvals queue — S-35 in docs/08-UI-UX-SPEC.md.
 *
 * The rule worth testing here is the one the screen must not be trusted with:
 * a Critical decision that completes on this caller's response never appears
 * among the things a single tap acts on (AP-04).
 */

const NOW = new Date("2026-08-27T12:00:00Z");

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "d1",
    type: "expense_approval",
    level: "normal",
    completesOnMyResponse: false,
    ...overrides,
  };
}

describe("grouping", () => {
  it("gives every decision type a group", () => {
    const types = Object.keys(GROUP_OF) as DecisionType[];
    expect(types).toHaveLength(14);
    for (const type of types) {
      expect(GROUP_ORDER).toContain(GROUP_OF[type]);
    }
  });

  it("orders sections by GROUP_ORDER, not by arrival", () => {
    const split = splitQueue([
      item({ id: "a", type: "close_settlement" }),
      item({ id: "b", type: "chore_confirmation" }),
      item({ id: "c", type: "expense_approval" }),
    ]);

    expect(split.sections.map((section) => section.group)).toEqual([
      "expenses",
      "chores",
      "settlement",
    ]);
  });

  it("omits a group with nothing in it", () => {
    const split = splitQueue([item({ type: "join_request" })]);
    expect(split.sections).toHaveLength(1);
    expect(split.sections[0]?.group).toBe("join_requests");
  });

  it("counts the deliberate section in the total", () => {
    const split = splitQueue([
      item({ id: "a" }),
      item({ id: "b", level: "critical", completesOnMyResponse: true }),
    ]);

    expect(split.total).toBe(2);
    expect(split.sections).toHaveLength(1);
    expect(split.deliberate.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("is empty in every part when nothing is waiting", () => {
    const split = splitQueue([]);
    expect(split).toEqual({ sections: [], deliberate: [], total: 0 });
  });
});

describe("the deliberate section", () => {
  it("holds back a Critical decision that would complete on this response", () => {
    expect(
      needsDeliberateAction(item({ level: "critical", completesOnMyResponse: true })),
    ).toBe(true);
  });

  it("batches a Critical decision still waiting on somebody else", () => {
    const split = splitQueue([
      item({ id: "a", type: "close_settlement", level: "critical" }),
    ]);

    expect(split.deliberate).toHaveLength(0);
    expect(split.sections[0]?.items.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("batches an Important decision that completes on this response", () => {
    // Only Critical earns the interruption. Every level below it is exactly
    // the traffic Approve All exists for.
    const split = splitQueue([
      item({ id: "a", level: "important", completesOnMyResponse: true }),
    ]);

    expect(split.deliberate).toHaveLength(0);
    expect(split.sections[0]?.items).toHaveLength(1);
  });

  it("never lists an item in both halves", () => {
    const items = [
      item({ id: "a", level: "critical", completesOnMyResponse: true }),
      item({ id: "b", level: "critical" }),
      item({ id: "c", type: "chore_confirmation" }),
    ];
    const split = splitQueue(items);

    const batched = split.sections.flatMap((section) => section.items.map((e) => e.id));
    expect(batched).not.toContain("a");
    expect(batched.length + split.deliberate.length).toBe(items.length);
  });
});

describe("awaitsResponse", () => {
  it("is true for an unanswered slot on an open decision", () => {
    expect(
      awaitsResponse({
        status: "waiting",
        deadline: new Date("2026-09-03T12:00:00Z"),
        capacities: ["approver"],
        responded: [],
        now: NOW,
      }),
    ).toBe(true);
  });

  it("is false once that capacity has answered", () => {
    expect(
      awaitsResponse({
        status: "waiting",
        deadline: null,
        capacities: ["approver"],
        responded: ["approver"],
        now: NOW,
      }),
    ).toBe(false);
  });

  it("is true when one of two capacities is still unanswered", () => {
    // A person listed twice — an approver on the count, an acknowledger by
    // role — has answered one question and not the other.
    expect(
      awaitsResponse({
        status: "waiting",
        deadline: null,
        capacities: ["approver", "acknowledger"],
        responded: ["approver"],
        now: NOW,
      }),
    ).toBe(true);
  });

  it("is false past the deadline, before the job has marked it lapsed", () => {
    expect(
      awaitsResponse({
        status: "waiting",
        deadline: new Date("2026-08-27T11:59:59Z"),
        capacities: ["approver"],
        responded: [],
        now: NOW,
      }),
    ).toBe(false);
  });

  it("is false for a decision that is no longer waiting", () => {
    for (const status of ["approved", "rejected", "lapsed", "cancelled", "applied"]) {
      expect(
        awaitsResponse({
          status,
          deadline: null,
          capacities: ["approver"],
          responded: [],
          now: NOW,
        }),
      ).toBe(false);
    }
  });

  it("is false for somebody who was never asked", () => {
    expect(
      awaitsResponse({
        status: "waiting",
        deadline: null,
        capacities: [],
        responded: [],
        now: NOW,
      }),
    ).toBe(false);
  });
});
