import { describe, expect, it } from "vitest";
import {
  needsYou,
  presenceLabel,
  presenceOn,
  type ApprovalNeed,
  type ConfirmationNeed,
  type DecisionNeed,
} from "@/lib/domain/home/today";

/**
 * S-50 — Today. The two parts of the screen that are decisions rather than
 * queries: the order of the merged "Needs you" list, and who counts as present.
 */

const decision = (over: Partial<DecisionNeed> = {}): DecisionNeed => ({
  id: "d1",
  label: "Remove a member",
  level: "critical",
  createdAt: "2026-08-26T09:00:00Z",
  approvalsGiven: 1,
  approvalsRequired: 2,
  ...over,
});

const confirmation = (over: Partial<ConfirmationNeed> = {}): ConfirmationNeed => ({
  id: "c1",
  choreName: "Kitchen cleaning",
  assigneeName: "Kumar",
  doneAt: "2026-08-26T10:00:00Z",
  createdAt: "2026-08-26T08:00:00Z",
  received: 1,
  required: 2,
  ...over,
});

const approval = (over: Partial<ApprovalNeed> = {}): ApprovalNeed => ({
  id: "e1",
  description: "Groceries",
  payerName: "Arun",
  amountLabel: "₹1,240",
  createdAt: "2026-08-26T07:00:00Z",
  ...over,
});

describe("needsYou", () => {
  it("puts a Critical decision above everything, whatever waited longer", () => {
    const items = needsYou({
      decisions: [decision({ createdAt: "2026-08-26T23:00:00Z" })],
      confirmations: [confirmation()],
      approvals: [approval()],
    });

    expect(items[0].kind).toBe("decision");
    expect(items[0].critical).toBe(true);
  });

  it("orders decisions, then confirmations, then approvals", () => {
    const items = needsYou({
      decisions: [decision({ level: "significant" })],
      confirmations: [confirmation()],
      approvals: [approval()],
    });

    expect(items.map((item) => item.kind)).toEqual([
      "decision",
      "confirmation",
      "approval",
    ]);
  });

  it("breaks a tie inside one kind towards whatever waited longest", () => {
    const items = needsYou({
      decisions: [
        decision({ id: "new", level: "significant", createdAt: "2026-08-26T12:00:00Z" }),
        decision({ id: "old", level: "significant", createdAt: "2026-08-20T12:00:00Z" }),
      ],
      confirmations: [],
      approvals: [],
    });

    expect(items.map((item) => item.id)).toEqual(["old", "new"]);
  });

  it("shows quorum progress on a confirmation, so it reads as contributing", () => {
    const [item] = needsYou({
      decisions: [],
      confirmations: [confirmation({ received: 1, required: 2 })],
      approvals: [],
    });

    expect(item.title).toBe("Kumar — Kitchen cleaning");
    expect(item.detail).toBe("1 of 2 confirmations");
  });

  it("is empty when nothing is waiting", () => {
    expect(needsYou({ decisions: [], confirmations: [], approvals: [] })).toEqual([]);
  });

  it("ages a confirmation from when it was done, not from when it was created", () => {
    const items = needsYou({
      decisions: [],
      confirmations: [
        confirmation({ id: "later", doneAt: "2026-08-26T18:00:00Z" }),
        confirmation({ id: "earlier", doneAt: "2026-08-26T06:00:00Z" }),
      ],
      approvals: [],
    });

    expect(items.map((item) => item.id)).toEqual(["earlier", "later"]);
  });
});

describe("presenceOn", () => {
  const members = [
    { memberId: "a", displayName: "Arun" },
    { memberId: "b", displayName: "Bala" },
    { memberId: "c", displayName: "Chitra" },
  ];

  it("counts an approved absence covering the date as away", () => {
    const presence = presenceOn("2026-08-26", members, [
      { memberId: "b", fromDate: "2026-08-25", toDate: "2026-08-27", status: "approved" },
    ]);

    expect(presence.away.map((row) => row.memberId)).toEqual(["b"]);
    expect(presence.home.map((row) => row.memberId)).toEqual(["a", "c"]);
  });

  it("leaves somebody home while their absence is still being decided", () => {
    const presence = presenceOn("2026-08-26", members, [
      { memberId: "b", fromDate: "2026-08-25", toDate: "2026-08-27", status: "pending" },
    ]);

    expect(presence.away).toEqual([]);
    expect(presence.home).toHaveLength(3);
  });

  it("ignores an approved absence that does not cover the date", () => {
    const presence = presenceOn("2026-08-26", members, [
      { memberId: "b", fromDate: "2026-08-20", toDate: "2026-08-22", status: "approved" },
    ]);

    expect(presence.away).toEqual([]);
  });

  it("includes both ends of the range", () => {
    const range = { memberId: "b", fromDate: "2026-08-26", toDate: "2026-08-28", status: "approved" };

    expect(presenceOn("2026-08-26", members, [range]).away).toHaveLength(1);
    expect(presenceOn("2026-08-28", members, [range]).away).toHaveLength(1);
    expect(presenceOn("2026-08-29", members, [range]).away).toHaveLength(0);
  });
});

describe("presenceLabel", () => {
  it("omits an away count of zero", () => {
    expect(presenceLabel({ home: [{ memberId: "a", displayName: "Arun" }], away: [] })).toBe(
      "1 home",
    );
  });

  it("reads both halves when somebody is away", () => {
    expect(
      presenceLabel({
        home: [
          { memberId: "a", displayName: "Arun" },
          { memberId: "c", displayName: "Chitra" },
        ],
        away: [{ memberId: "b", displayName: "Bala", reason: "absence" }],
      }),
    ).toBe("2 home · 1 away");
  });
});
