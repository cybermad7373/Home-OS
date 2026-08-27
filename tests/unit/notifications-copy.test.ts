import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIGEST_BODY_LIMIT,
  SETTLEMENT_OUTCOME,
  TEMPLATES,
  fill,
  render,
  truncate,
} from "@/lib/domain/notifications/copy";
import { CATALOGUE, type NotificationType } from "@/lib/domain/notifications/catalogue";

/**
 * The copy exists twice and must never differ.
 *
 * A notification has to be written the instant its cause happens, which means a
 * database trigger renders it, which means the templates live in a table. The
 * client needs the same strings, which means they live in TypeScript too. Two
 * copies is the honest answer to that constraint; two copies that have drifted
 * is not.
 *
 * So this test reads migration 041 and holds the two to each other. It is the
 * single source of truth: not one location, but one enforced agreement.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260824090041_notification_functions.sql",
);

/**
 * Phase 9 added one more type — N-31, the rejected-AI-key notice — in its own
 * migration. The agreement this file enforces is between the client and the
 * database, not between the client and one file, so both seeds are read.
 */
const LLM_MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260826090045_llm_credentials.sql",
);

/**
 * Phase 11 added thirteen more — N-32 to N-44, governance and membership — in
 * migration 055, for the same reason: a seed lives with the feature that needs
 * it rather than in the file that happened to be first.
 */
const GOVERNANCE_MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260827090055_governance_notifications.sql",
);

/**
 * Splits a SQL `values` list into rows of literals.
 *
 * Small and deliberately unclever: it walks the text, tracks whether it is
 * inside a quoted string, and understands `''` as an escaped quote. That is the
 * whole of the SQL grammar this file uses.
 */
function parseValues(sql: string, marker: string): string[][] {
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${marker} in the migration`);

  const rows: string[][] = [];
  let current: string[] = [];
  let literal: string | null = null;
  let inString = false;
  let depth = 0;

  for (let index = start + marker.length; index < sql.length; index += 1) {
    const char = sql[index];

    if (inString) {
      if (char === "'") {
        if (sql[index + 1] === "'") {
          literal += "'";
          index += 1;
        } else {
          inString = false;
        }
      } else {
        literal += char;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      literal = "";
      continue;
    }

    if (char === "(") {
      depth += 1;
      current = [];
      continue;
    }

    if (char === ")") {
      depth -= 1;
      // The row's last value has no comma after it, so it is flushed here.
      if (literal !== null) {
        current.push(literal);
        literal = null;
      }
      rows.push(current);
      continue;
    }

    if (char === "," && depth === 1) {
      if (literal !== null) {
        current.push(literal);
        literal = null;
      }
      continue;
    }

    if (char === ";" && depth === 0) break;

    // Unquoted tokens — the integers and booleans — are collected as-is.
    if (depth === 1 && /[^\s]/.test(char)) {
      const rest = sql.slice(index).match(/^[A-Za-z0-9_]+/);
      if (rest) {
        current.push(rest[0]);
        index += rest[0].length - 1;
      }
    }

    if (char === ")" && depth === 0) break;
  }

  return rows.filter((row) => row.length > 0);
}

/** A migration checked out with CRLF is the same migration. */
function readSql(path: string): string {
  return readFileSync(path, "utf8").split("\r\n").join("\n");
}

const sql = readSql(MIGRATION);
const TYPE_INSERT_MARKER =
  "insert into notification_types\n  (type, category, priority, quiet_hours_exempt, label, title_template, body_template, deep_link_template)\nvalues";

const typeRows = [
  ...parseValues(sql, TYPE_INSERT_MARKER),
  ...parseValues(readSql(LLM_MIGRATION), TYPE_INSERT_MARKER),
  ...parseValues(readSql(GOVERNANCE_MIGRATION), TYPE_INSERT_MARKER),
];
const variantRows = parseValues(
  sql,
  "insert into notification_variants (type, variant, body_template) values",
);

describe("the database and the client agree", () => {
  it("seeds every one of the forty-four types", () => {
    expect(typeRows).toHaveLength(44);
    const seeded = typeRows.map((row) => row[0]).sort();
    expect(seeded).toEqual(Object.keys(TEMPLATES).sort());
  });

  it("carries the same title, body and deep link for each", () => {
    for (const row of typeRows) {
      const [type, , , , , title, body, link] = row;
      const template = TEMPLATES[type as NotificationType];

      expect(template, `${type} is missing from copy.ts`).toBeDefined();
      expect(template.title, `${type} title`).toBe(title);
      expect(template.body, `${type} body`).toBe(body);
      expect(template.deepLink, `${type} deep link`).toBe(link);
    }
  });

  it("carries the same category, priority and quiet-hours exemption", () => {
    for (const row of typeRows) {
      const [type, category, priority, exempt] = row;
      const entry = CATALOGUE[type as NotificationType];

      expect(entry.category, `${type} category`).toBe(category);
      expect(entry.priority, `${type} priority`).toBe(Number(priority));
      expect(entry.quietHoursExempt, `${type} exemption`).toBe(exempt === "true");
    }
  });

  it("carries the same three settlement variants", () => {
    expect(variantRows).toHaveLength(3);
    for (const [type, variant, body] of variantRows) {
      expect(type).toBe("N-22");
      expect(SETTLEMENT_OUTCOME[variant as keyof typeof SETTLEMENT_OUTCOME]).toBe(body);
    }
  });
});

describe("rendering", () => {
  it("substitutes every placeholder", () => {
    const rendered = render("N-02", {
      chore: "Cook dinner",
      time: "19:30",
      points: 30,
      start: "19:30",
      end: "22:00",
    });

    expect(rendered.title).toBe("Cook dinner — 19:30");
    expect(rendered.body).toBe("30 points. Window: 19:30 to 22:00.");
    expect(rendered.deepLink).toBe("/chores/mine");
  });

  it("refuses to ship a brace", () => {
    expect(() => render("N-02", { chore: "Mop" })).toThrowError(/missing \{time\}/);
  });

  it("picks the settlement body from the outcome", () => {
    expect(render("N-22", { month: "August 2026", outcome: "owing", amount: "1,240" }).body).toBe(
      "You owe ₹1,240. Tap to pay.",
    );
    expect(render("N-22", { month: "August 2026", outcome: "owed", amount: "310" }).body).toBe(
      "You're owed ₹310.",
    );
    expect(render("N-22", { month: "August 2026", outcome: "square" }).body).toBe(
      "You're square.",
    );
  });

  it("leaves an unused variable alone", () => {
    expect(fill("Hello {name}", { name: "Ravi", spare: "x" })).toBe("Hello Ravi");
  });
});

describe("digest truncation", () => {
  it("leaves a short summary as it is", () => {
    expect(truncate("Short enough.")).toBe("Short enough.");
  });

  it("cuts a long one to the limit", () => {
    const long = "word ".repeat(100);
    const cut = truncate(long);

    expect(cut.length).toBeLessThanOrEqual(DIGEST_BODY_LIMIT);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("cuts at a word boundary when one is near", () => {
    const text = `${"a".repeat(170)} tail word here`;
    expect(truncate(text)).not.toContain("wor…");
  });
});
