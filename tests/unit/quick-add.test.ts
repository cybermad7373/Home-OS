import { describe, expect, it } from "vitest";
import { quickAddGroups, quickAddOptions } from "@/components/layout/quick-add";

/**
 * The universal quick-add — docs/08-UI-UX-SPEC.md section 3.6.
 *
 * "The sheet shows only what the caller may actually do." That is a rule about
 * privilege, so it is asserted rather than left to the rendering.
 *
 * The second rule this file now holds is coverage. The sheet offered four
 * things to a member and seven to an admin while a Home creates a good deal
 * more than seven kinds of thing, and everything it left out lived two or
 * three taps down inside a collapsed sidebar group. A quick-add that covers a
 * third of what a Home makes is a menu people learn to skip.
 */
describe("quickAddOptions", () => {
  const labels = (options: { label: string }[]) => options.map((option) => option.label);

  it("offers a member everything they can record about themselves", () => {
    expect(labels(quickAddOptions({ isAdmin: false, isLead: false }))).toEqual([
      "Expense",
      "Meal",
      "Chore done",
      "Absence",
      "Shopping item",
      "Guest",
      "Home",
    ]);
  });

  it("adds what a Co-Admin shapes the home with", () => {
    expect(labels(quickAddOptions({ isAdmin: false, isLead: true }))).toEqual([
      "Expense",
      "Meal",
      "Chore done",
      "Absence",
      "Shopping item",
      "Guest",
      "Chore",
      "Category",
      "Room",
      "Announcement",
      "Home",
    ]);
  });

  it("adds rules, people and recurring expenses for an Admin", () => {
    expect(labels(quickAddOptions({ isAdmin: true, isLead: true }))).toEqual([
      "Expense",
      "Meal",
      "Chore done",
      "Absence",
      "Shopping item",
      "Guest",
      "Chore",
      "Category",
      "Room",
      "Announcement",
      "Rule",
      "Person",
      "Recurring expense",
      "Home",
    ]);
  });

  it("never offers a member an option that would open and then refuse", () => {
    const member = labels(quickAddOptions({ isAdmin: false, isLead: false }));

    for (const privileged of [
      "Rule",
      "Chore",
      "Category",
      "Room",
      "Announcement",
      "Person",
      "Recurring expense",
    ]) {
      expect(member).not.toContain(privileged);
    }
  });

  it("points every option at a route that takes it straight to the form", () => {
    const options = quickAddOptions({ isAdmin: true, isLead: true });

    expect(options.map((option) => option.href)).toEqual([
      "/expenses?add=1",
      "/food?add=1",
      "/chores/mine",
      "/house/away",
      "/food/shopping",
      "/house/guests",
      "/admin/chores",
      "/house/categories?add=1",
      "/house/rooms?add=1",
      "/today?add=announcement",
      "/more/rules/new",
      "/house/members?add=1",
      "/expenses/recurring?add=1",
      "/homes",
    ]);
  });

  it("never lists the same destination twice", () => {
    const hrefs = quickAddOptions({ isAdmin: true, isLead: true }).map((o) => o.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("quickAddGroups", () => {
  it("hides the Set up group entirely from somebody who sets up nothing", () => {
    const headings = quickAddGroups({ isAdmin: false, isLead: false }).map(
      (group) => group.heading,
    );

    expect(headings).toEqual(["Record", "Elsewhere"]);
  });

  it("gives a lead all three groups", () => {
    const headings = quickAddGroups({ isAdmin: true, isLead: true }).map(
      (group) => group.heading,
    );

    expect(headings).toEqual(["Record", "Set up", "Elsewhere"]);
  });
});
