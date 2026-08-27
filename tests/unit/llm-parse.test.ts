import { describe, expect, it } from "vitest";
import {
  PARSE_DAILY_CAP_PER_MEMBER,
  buildParsePayload,
  normaliseParse,
  type ParseContext,
} from "@/lib/domain/llm/parse";
import {
  PARSE_CAP_PER_DAY,
  countParse,
  parsesUsed,
  resetParseCounts,
  underParseCap,
} from "@/lib/infra/llm/rate";

/**
 * Call site 3 — docs/10-LLM-SPEC.md section 7.4.
 *
 * The rule this file exists to hold: nothing here writes. A confident parse
 * pre-fills a form, an uncertain one warns, and an unconfident one clears the
 * form and shows the model's own question. A wrong guess with the save button
 * already pressed is the one outcome that would make this feature harmful.
 */

const ctx: ParseContext = {
  today: "2026-08-23",
  categories: ["Groceries", "Rent", "Utilities", "Other"],
  openChores: [
    { id: "uuid-assignment-1", chore: "Mop common area", date: "2026-08-23" },
    { id: "uuid-assignment-2", chore: "Take out rubbish", date: "2026-08-23" },
  ],
};

describe("a confident expense", () => {
  it("pre-fills the form, with the save button live", () => {
    const proposal = normaliseParse(
      {
        intent: "expense",
        confidence: 0.94,
        expense: {
          amount_rupees: 840,
          category: "Groceries",
          date: "2026-08-22",
          description: "Vegetables",
        },
      },
      ctx,
      "paid 840 for vegetables yesterday",
    );

    expect(proposal.presentation).toBe("prefilled");
    expect(proposal.expense).toEqual({
      amount: "840.00",
      category: "Groceries",
      expense_date: "2026-08-22",
      description: "Vegetables",
    });
    expect(proposal.adjustments).toEqual([]);
  });

  it("warns between 0.70 and 0.85 rather than pretending to be sure", () => {
    const proposal = normaliseParse(
      {
        intent: "expense",
        confidence: 0.74,
        expense: { amount_rupees: 840, category: "Groceries", date: "2026-08-22" },
      },
      ctx,
      "840 veg",
    );

    expect(proposal.presentation).toBe("prefilled_warn");
  });
});

describe("what the model gets wrong", () => {
  it("falls back to Other for a category the house does not have", () => {
    const proposal = normaliseParse(
      {
        intent: "expense",
        confidence: 0.9,
        expense: { amount_rupees: 200, category: "Pet food", date: "2026-08-23" },
      },
      ctx,
      "200 for the dog",
    );

    expect(proposal.expense?.category).toBe("Other");
    expect(proposal.adjustments).toContain("CATEGORY_FALLBACK");
  });

  it("falls back to today for a date in the future or long past", () => {
    for (const date of ["2027-01-01", "2020-01-01", "not-a-date"]) {
      const proposal = normaliseParse(
        {
          intent: "expense",
          confidence: 0.9,
          expense: { amount_rupees: 200, category: "Groceries", date },
        },
        ctx,
        "200 veg",
      );

      expect(proposal.expense?.expense_date, date).toBe(ctx.today);
      expect(proposal.adjustments, date).toContain("DATE_FALLBACK");
    }
  });

  it("refuses an impossible amount rather than pre-filling it", () => {
    for (const amount of [0, -5, 5_000_000]) {
      const proposal = normaliseParse(
        {
          intent: "expense",
          confidence: 0.99,
          expense: { amount_rupees: amount, category: "Groceries", date: "2026-08-23" },
        },
        ctx,
        "spent something",
      );

      expect(proposal.intent, String(amount)).toBe("unknown");
      expect(proposal.presentation, String(amount)).toBe("empty");
      expect(proposal.adjustments, String(amount)).toContain("AMOUNT_REJECTED");
    }
  });

  it("refuses a chore that is not one of this member's own", () => {
    const proposal = normaliseParse(
      { intent: "chore_done", confidence: 0.95, chore_done: { assignment_id: "a9" } },
      ctx,
      "I mopped the hall",
    );

    expect(proposal.intent).toBe("unknown");
    expect(proposal.adjustments).toContain("UNKNOWN_ASSIGNMENT");
  });
});

describe("a chore", () => {
  it("resolves the opaque id back to the real assignment", () => {
    const proposal = normaliseParse(
      { intent: "chore_done", confidence: 0.91, chore_done: { assignment_id: "a1" } },
      ctx,
      "I mopped the hall",
    );

    expect(proposal.chore).toEqual({
      assignment_id: "uuid-assignment-1",
      chore: "Mop common area",
    });
  });
});

describe("low confidence", () => {
  it("empties the form and shows the model's question", () => {
    const proposal = normaliseParse(
      {
        intent: "expense",
        confidence: 0.42,
        expense: { amount_rupees: 840 },
        clarification: "Was that 840 rupees, and for what?",
      },
      ctx,
      "840 something",
    );

    expect(proposal.presentation).toBe("empty");
    expect(proposal.expense).toBeUndefined();
    expect(proposal.clarification).toBe("Was that 840 rupees, and for what?");
  });

  it("says nothing at all for an unknown intent — no error, no blame", () => {
    const proposal = normaliseParse({ intent: "unknown", confidence: 0.2 }, ctx, "hello");
    expect(proposal.presentation).toBe("empty");
    expect(proposal.adjustments).toEqual([]);
  });
});

describe("the payload", () => {
  it("sends opaque chore ids, never the assignment's UUID", () => {
    const payload = JSON.stringify(buildParsePayload("mopped the hall", ctx));
    expect(payload).not.toContain("uuid-assignment-1");
    expect(payload).toContain('"id":"a1"');
  });
});

describe("the daily cap", () => {
  it("is the same number the specification names in both places", () => {
    expect(PARSE_CAP_PER_DAY).toBe(PARSE_DAILY_CAP_PER_MEMBER);
  });

  it("stops one member at twenty parses without touching anybody else", () => {
    resetParseCounts();

    for (let i = 0; i < PARSE_CAP_PER_DAY; i += 1) {
      expect(underParseCap("member-1", "2026-08-23")).toBe(true);
      countParse("member-1", "2026-08-23");
    }

    expect(underParseCap("member-1", "2026-08-23")).toBe(false);
    expect(underParseCap("member-2", "2026-08-23")).toBe(true);
    // A new day starts the count again.
    expect(underParseCap("member-1", "2026-08-24")).toBe(true);
    expect(parsesUsed("member-1", "2026-08-24")).toBe(0);
  });
});
