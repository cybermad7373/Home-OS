import { describe, expect, it } from "vitest";
import {
  ownRowsFirst,
  owesRows,
  pendingItems,
  totalPending,
  type PendingCounts,
} from "@/lib/domain/home/overview";

/**
 * S-51 — the Home overview. What is tested here is the part that is a
 * decision rather than a query: which queues a caller is shown, in what order,
 * and who owes whom for everyone (DB-03).
 */

const NONE: PendingCounts = {
  joinRequests: 0,
  expenseApprovals: 0,
  decisions: 0,
  choreConfirmations: 0,
};

describe("pendingItems", () => {
  it("omits a queue that is empty rather than showing a zero row", () => {
    expect(pendingItems(NONE, { isLead: true })).toEqual([]);
  });

  it("puts decisions above confirmations, and confirmations above approvals", () => {
    const items = pendingItems(
      { ...NONE, decisions: 1, expenseApprovals: 2, choreConfirmations: 3 },
      { isLead: false },
    );

    expect(items.map((item) => item.key)).toEqual([
      "decisions",
      "choreConfirmations",
      "expenseApprovals",
    ]);
  });

  it("hides join requests from a member who cannot act on them", () => {
    const counts = { ...NONE, joinRequests: 2 };

    expect(pendingItems(counts, { isLead: false })).toEqual([]);
    expect(pendingItems(counts, { isLead: true })).toHaveLength(1);
  });

  it("writes singular and plural as different sentences", () => {
    expect(pendingItems({ ...NONE, decisions: 1 }, { isLead: true })[0].label).toBe(
      "1 decision is waiting on you",
    );
    expect(pendingItems({ ...NONE, decisions: 4 }, { isLead: true })[0].label).toBe(
      "4 decisions are waiting on you",
    );
  });

  it("marks the two queues that block somebody else as urgent", () => {
    const items = pendingItems(
      { joinRequests: 1, expenseApprovals: 1, decisions: 1, choreConfirmations: 1 },
      { isLead: true },
    );

    expect(items.filter((item) => item.urgent).map((item) => item.key)).toEqual([
      "decisions",
      "choreConfirmations",
    ]);
  });

  it("counts only what the caller can act on", () => {
    const counts = { ...NONE, joinRequests: 5, decisions: 2 };

    expect(totalPending(counts, { isLead: false })).toBe(2);
    expect(totalPending(counts, { isLead: true })).toBe(7);
  });
});

describe("owesRows", () => {
  it("nets a house down to transfers that sum to what is owed", () => {
    const rows = owesRows([
      { memberId: "a", displayName: "Arun", netPaise: 60000 },
      { memberId: "b", displayName: "Bala", netPaise: -20000 },
      { memberId: "c", displayName: "Chitra", netPaise: -40000 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.toName === "Arun")).toBe(true);
    expect(rows.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(60000);
  });

  it("returns nothing when everybody is square", () => {
    expect(
      owesRows([
        { memberId: "a", displayName: "Arun", netPaise: 0 },
        { memberId: "b", displayName: "Bala", netPaise: 0 },
      ]),
    ).toEqual([]);
  });

  it("names both sides, so the row reads without a second lookup", () => {
    const [row] = owesRows([
      { memberId: "a", displayName: "Arun", netPaise: 15000 },
      { memberId: "b", displayName: "Bala", netPaise: -15000 },
    ]);

    expect(row.fromName).toBe("Bala");
    expect(row.toName).toBe("Arun");
    expect(row.amountPaise).toBe(15000);
  });
});

describe("ownRowsFirst", () => {
  it("lifts the caller's own rows above everybody else's, order otherwise kept", () => {
    const rows = owesRows([
      { memberId: "a", displayName: "Arun", netPaise: 50000 },
      { memberId: "b", displayName: "Bala", netPaise: 30000 },
      { memberId: "c", displayName: "Chitra", netPaise: -50000 },
      { memberId: "d", displayName: "Dev", netPaise: -30000 },
    ]);

    const ordered = ownRowsFirst(rows, "d");

    expect(ordered[0].fromMemberId === "d" || ordered[0].toMemberId === "d").toBe(true);
    expect(ordered).toHaveLength(rows.length);
  });
});
