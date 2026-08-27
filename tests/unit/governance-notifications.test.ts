import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGUE, MANDATORY, pushAllowed } from "@/lib/domain/notifications/catalogue";
import { TEMPLATES, render } from "@/lib/domain/notifications/copy";
import { DECISION_ACTION_PHRASE, DECISION_TYPE_LABEL } from "@/lib/types/domain";
import type { DecisionType } from "@/lib/domain/governance/types";

/**
 * The governance notifications, held to the specification and to the database.
 *
 * `tests/unit/notifications-copy.test.ts` already holds every template to the
 * migration that seeds it. This file covers the parts of section 2.8 and 2.9
 * that are not copy: which switch governs which notification, which switches
 * cannot be turned off, and the verb phrases that exist in two languages.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260827090055_governance_notifications.sql",
);

const sql = readFileSync(MIGRATION, "utf8").split("\r\n").join("\n");

/**
 * Reads `decision_action_phrase`'s case arms back out of the migration.
 *
 * The phrases are rendered by triggers, so they have to exist in SQL; the
 * client renders the same notifications from its own feed, so they have to
 * exist in TypeScript. Two copies is the honest answer to that; two copies
 * that have drifted is not.
 */
function phrasesFromSql(): Record<string, string> {
  const start = sql.indexOf("create or replace function decision_action_phrase");
  expect(start, "decision_action_phrase is missing from migration 055").toBeGreaterThan(-1);
  const body = sql.slice(start, sql.indexOf("$$ language sql immutable", start));

  const phrases: Record<string, string> = {};
  for (const [, type, phrase] of body.matchAll(/when '([a-z_]+)'\s+then '([^']+)'/g)) {
    phrases[type] = phrase;
  }
  return phrases;
}

describe("the decision action phrases", () => {
  const fromSql = phrasesFromSql();

  it("says the same thing in SQL and in TypeScript", () => {
    expect(Object.keys(fromSql).sort()).toEqual(Object.keys(DECISION_ACTION_PHRASE).sort());
    for (const [type, phrase] of Object.entries(fromSql)) {
      expect(DECISION_ACTION_PHRASE[type as DecisionType], type).toBe(phrase);
    }
  });

  it("covers every decision type the labels cover", () => {
    expect(Object.keys(DECISION_ACTION_PHRASE).sort()).toEqual(
      Object.keys(DECISION_TYPE_LABEL).sort(),
    );
  });

  it("reads as a verb phrase, so that '{proposer} wants to {action}' is a sentence", () => {
    for (const phrase of Object.values(DECISION_ACTION_PHRASE)) {
      expect(phrase, phrase).toBe(phrase.toLowerCase());
      expect(phrase.endsWith("."), phrase).toBe(false);
    }
  });
});

describe("the preference each one answers to — section 6", () => {
  const EXPECTED: Record<string, string> = {
    "N-32": "decisions",
    "N-33": "decisions",
    "N-34": "decision_outcomes",
    "N-35": "decisions",
    "N-36": "decisions",
    "N-37": "decisions",
    "N-38": "membership",
    "N-39": "membership",
    "N-40": "membership",
    "N-41": "house_activity",
    "N-42": "decisions",
    "N-43": "decisions",
    "N-44": "membership",
  };

  it("files each of the thirteen under the switch the spec names", () => {
    for (const [type, category] of Object.entries(EXPECTED)) {
      expect(CATALOGUE[type as keyof typeof CATALOGUE].category, type).toBe(category);
    }
  });

  it("cannot be silenced where the reader is the one being asked", () => {
    expect(MANDATORY).toContain("decisions");

    // Every notification addressed to somebody whose answer the house is
    // waiting for. Muting these would make lapse the default outcome of every
    // Critical decision.
    for (const type of ["N-32", "N-33", "N-35", "N-36", "N-37", "N-42", "N-43"] as const) {
      expect(pushAllowed(type, { decisions: false }), type).toBe(true);
    }
  });

  it("can be silenced where the notification is news", () => {
    expect(pushAllowed("N-34", { decision_outcomes: false })).toBe(false);
    expect(pushAllowed("N-41", { house_activity: false })).toBe(false);
    expect(pushAllowed("N-44", { membership: false })).toBe(false);
  });

  it("exempts only the deadline reminder from quiet hours", () => {
    expect(CATALOGUE["N-33"].quietHoursExempt).toBe(true);
    for (const type of ["N-32", "N-34", "N-35", "N-36", "N-37", "N-42", "N-44"] as const) {
      expect(CATALOGUE[type].quietHoursExempt, type).toBe(false);
    }
  });
});

describe("what the thirteen actually say", () => {
  it("names the proposer and the ask, and how many others were asked", () => {
    const rendered = render("N-32", {
      proposer: "Asha",
      action: DECISION_ACTION_PHRASE.close_settlement,
      verb: "approve",
      n: 3,
      id: "d1",
    });

    expect(rendered.title).toBe("Asha wants to close the month");
    expect(rendered.body).toBe("You need to approve this. 3 others too.");
    expect(rendered.deepLink).toBe("/more/approvals/d1");
  });

  it("tells the person being removed, before anything is decided", () => {
    const rendered = render("N-42", { proposer: "Asha", reason: "Left in March" });

    expect(rendered.title).toBe("Asha proposed removing you");
    expect(rendered.body).toBe('"Left in March" — the house is deciding.');
  });

  it("states the outstanding amount when a removal leaves money behind", () => {
    const rendered = render("N-43", { home: "Flat 3B", amount: "1,240.00" });

    expect(rendered.title).toBe("You're no longer active in Flat 3B");
    expect(rendered.body).toContain("₹1,240.00 is still to settle");
  });

  it("says nothing changed when a decision lapses", () => {
    const rendered = render("N-36", { action: DECISION_ACTION_PHRASE.remove_member });

    expect(rendered.title).toBe("remove a member lapsed");
    expect(rendered.body).toBe("Nobody answered in time. Nothing changed.");
  });

  it("distinguishes the house agreeing from the app managing it", () => {
    const rendered = render("N-37", {
      action: DECISION_ACTION_PHRASE.create_reserve,
      reason: "EFFECT_NOT_IMPLEMENTED",
    });

    expect(rendered.body).toBe("The house agreed, but: EFFECT_NOT_IMPLEMENTED");
  });

  it("ships no unsubstituted brace in any of them", () => {
    for (const type of Object.keys(TEMPLATES)) {
      if (!type.startsWith("N-3") && !type.startsWith("N-4")) continue;
      const template = TEMPLATES[type as keyof typeof TEMPLATES];
      const vars = Object.fromEntries(
        [...`${template.title} ${template.body} ${template.deepLink}`.matchAll(/{(\w+)}/g)].map(
          ([, name]) => [name, "x"],
        ),
      );
      const rendered = render(type as keyof typeof TEMPLATES, vars);
      expect(`${rendered.title}${rendered.body}${rendered.deepLink}`, type).not.toMatch(/[{}]/);
    }
  });
});

describe("the jobs behind them", () => {
  it("schedules the expiry sweep and the reminder sweep apart", () => {
    expect(sql).toContain("cron.schedule('expire-decisions', '5 * * * *'");
    expect(sql).toContain("cron.schedule('decision-reminders', '20 * * * *'");
  });

  it("keeps the reminder job off the browser's reach", () => {
    expect(sql).toContain(
      "revoke execute on function remind_decision_participants() from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke execute on function notify_apply_refused(uuid, text) from public, anon, authenticated",
    );
  });

  it("reminds only people who have not answered", () => {
    const start = sql.indexOf("create or replace function remind_decision_participants");
    const body = sql.slice(start, sql.indexOf("$$ language plpgsql", start));

    expect(body).toContain("d.status = 'waiting'");
    expect(body).toContain("d.deadline <= now() + interval '24 hours'");
    expect(body).toContain("from decision_responses r");
  });
});
