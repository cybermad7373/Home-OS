import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  budgetsCsv,
  csvField,
  effortCsv,
  expensesCsv,
  exportFilename,
  membersCsv,
  spendCsv,
  toCsv,
  type ExpenseLedgerRow,
} from "@/lib/domain/analytics/csv";
import type { DailyCostSummary } from "@/lib/domain/analytics/daily-cost";

/**
 * A minimal RFC 4180 reader. The export is only worth anything if a spreadsheet
 * can read it back, so the property test parses what the writer produced rather
 * than asserting on its punctuation.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && text[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

describe("csvField", () => {
  it("quotes separators, quotes, newlines and padded values", () => {
    expect(csvField("Groceries, weekly")).toBe('"Groceries, weekly"');
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField("two\r\nlines")).toBe('"two\r\nlines"');
    expect(csvField(" padded ")).toBe('" padded "');
  });

  it("leaves ordinary values, including negative amounts, untouched", () => {
    expect(csvField("Rent")).toBe("Rent");
    expect(csvField("-1240.50")).toBe("-1240.50");
    expect(csvField(0)).toBe("0");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("neutralises a field a spreadsheet would execute", () => {
    // A member may name a category anything at all, and that name reaches a
    // spreadsheet that evaluates leading '=' as a formula.
    expect(csvField("=cmd|' /c calc'!A0")).toBe(`"'=cmd|' /c calc'!A0"`);
    expect(csvField("+1-555")).toBe(`"'+1-555"`);
    expect(csvField("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvField("-cmd")).toBe(`"'-cmd"`);
  });
});

describe("toCsv", () => {
  it("writes a header, CRLF rows and a trailing newline", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2\r\n");
  });

  it("round-trips any field through a spreadsheet reader", () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.string(), { minLength: 1, maxLength: 4 }), {
        minLength: 1,
        maxLength: 6,
      }), (rows) => {
        const width = rows[0].length;
        const square = rows.map((row) =>
          Array.from({ length: width }, (_, index) => row[index] ?? ""),
        );
        const header = Array.from({ length: width }, (_, index) => `col${index}`);
        const parsed = parseCsv(toCsv(header, square));

        expect(parsed[0]).toEqual(header);
        parsed.slice(1).forEach((parsedRow, rowIndex) => {
          parsedRow.forEach((value, columnIndex) => {
            const original = square[rowIndex][columnIndex];
            // The guard prefix is the one deliberate difference, and it is the
            // only one: everything else must come back byte for byte.
            const expected = value.startsWith("'") && !original.startsWith("'")
              ? `'${original}`
              : original;
            expect(value).toBe(expected);
          });
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe("expensesCsv", () => {
  const rows: ExpenseLedgerRow[] = [
    {
      date: "2026-08-02",
      description: "Milk, eggs",
      categoryName: "Groceries",
      paidBy: "Ravi",
      amountPaise: 124050,
      status: "approved",
      splitMethod: "equal",
      approvedAt: "2026-08-02T11:00:00Z",
    },
    {
      date: "2026-08-04",
      description: "",
      categoryName: "Gas",
      paidBy: "Meera",
      amountPaise: 90000,
      status: "pending",
      splitMethod: "equal",
      approvedAt: null,
    },
  ];

  it("writes rupees as a plain decimal a spreadsheet reads as a number", () => {
    const parsed = parseCsv(expensesCsv(rows));
    expect(parsed[0][0]).toBe("Date");
    expect(parsed[1]).toEqual([
      "2026-08-02",
      "Milk, eggs",
      "Groceries",
      "Ravi",
      "1240.50",
      "approved",
      "equal",
      "2026-08-02T11:00:00Z",
    ]);
  });

  it("keeps a pending row, with its status and an empty approval time", () => {
    const parsed = parseCsv(expensesCsv(rows));
    expect(parsed[2][5]).toBe("pending");
    expect(parsed[2][7]).toBe("");
  });
});

describe("spendCsv", () => {
  it("puts months across the header and totals on their own row", () => {
    const parsed = parseCsv(
      spendCsv({
        months: ["2026-07", "2026-08"],
        totals: [800000, 4200000],
        categories: [
          { categoryId: "rent", name: "Rent", totals: [0, 3000000] },
          { categoryId: "food", name: "Food", totals: [800000, 1200000] },
        ],
      }),
    );

    expect(parsed[0]).toEqual(["Category", "2026-07", "2026-08"]);
    expect(parsed[1]).toEqual(["Rent", "0.00", "30000.00"]);
    expect(parsed.at(-1)).toEqual(["All categories", "8000.00", "42000.00"]);
  });
});

describe("membersCsv", () => {
  it("reports each member's net and closes with the house total", () => {
    const parsed = parseCsv(
      membersCsv({
        period: "2026-08",
        totalPaidPaise: 300000,
        totalFairSharePaise: 300000,
        members: [
          { memberId: "m1", displayName: "Ravi", paidPaise: 300000, fairSharePaise: 150000, netPaise: 150000 },
          { memberId: "m2", displayName: "Meera", paidPaise: 0, fairSharePaise: 150000, netPaise: -150000 },
        ],
      }),
    );

    expect(parsed[1]).toEqual(["2026-08", "Ravi", "3000.00", "1500.00", "1500.00"]);
    expect(parsed[2][4]).toBe("-1500.00");
    expect(parsed[3]).toEqual(["2026-08", "House total", "3000.00", "3000.00", "0.00"]);
  });
});

describe("effortCsv", () => {
  it("reports the concentration ratio as a percentage per month", () => {
    const parsed = parseCsv(
      effortCsv({
        months: ["2026-07", "2026-08"],
        history: [
          { month: "2026-07", totalEarnedPoints: 0, topThreeEarnedPoints: 0, concentrationRatio: 0 },
          { month: "2026-08", totalEarnedPoints: 400, topThreeEarnedPoints: 260, concentrationRatio: 0.65 },
        ],
      }),
    );

    expect(parsed[1]).toEqual(["2026-07", "0", "0", "0.0"]);
    expect(parsed[2]).toEqual(["2026-08", "400", "260", "65.0"]);
  });
});

describe("budgetsCsv", () => {
  const summary = {
    period: "2026-08",
    categories: [
      {
        categoryId: "food",
        name: "Groceries",
        icon: "🥬",
        spentPaise: 3200000,
        budgetPaise: 3000000,
        fractionUsed: 3200000 / 3000000,
        over: true,
      },
      {
        categoryId: "gas",
        name: "Gas",
        icon: null,
        spentPaise: 90000,
        budgetPaise: null,
        fractionUsed: null,
        over: false,
      },
    ],
  } as DailyCostSummary & { period: string };

  it("flags a breach and leaves an unbudgeted category's columns empty", () => {
    const parsed = parseCsv(budgetsCsv(summary));
    expect(parsed[1]).toEqual(["2026-08", "Groceries", "32000.00", "30000.00", "106.7", "yes"]);
    expect(parsed[2]).toEqual(["2026-08", "Gas", "900.00", "", "", ""]);
  });
});

describe("exportFilename", () => {
  it("names the file after its content and scope", () => {
    expect(exportFilename("expenses", "2026-08")).toBe("houseos-expenses-2026-08.csv");
    expect(exportFilename("spend", "2026-03-to-2026-08")).toBe(
      "houseos-spend-2026-03-to-2026-08.csv",
    );
  });

  it("strips anything a header could not carry safely", () => {
    expect(exportFilename("effort", '2026"; rm -rf /')).toBe("houseos-effort-2026rm-rf.csv");
  });
});
