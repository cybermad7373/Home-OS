import { describe, expect, it } from "vitest";
import { quickAddOptions } from "@/components/layout/quick-add";

/**
 * The universal quick-add — docs/08-UI-UX-SPEC.md section 3.6.
 *
 * "The sheet shows only what the caller may actually do." That is a rule about
 * privilege, so it is asserted rather than left to the rendering.
 */
describe("quickAddOptions", () => {
  const labels = (options: { label: string }[]) => options.map((option) => option.label);

  it("offers a member the four things they can record about themselves", () => {
    expect(labels(quickAddOptions({ isAdmin: false, isLead: false }))).toEqual([
      "Expense",
      "Meal",
      "Chore done",
      "Absence",
    ]);
  });

  it("adds Chore and Category for a Co-Admin, and no more", () => {
    expect(labels(quickAddOptions({ isAdmin: false, isLead: true }))).toEqual([
      "Expense",
      "Meal",
      "Chore done",
      "Absence",
      "Chore",
      "Category",
    ]);
  });

  it("adds Rule on top of those for an Admin", () => {
    expect(labels(quickAddOptions({ isAdmin: true, isLead: true }))).toEqual([
      "Expense",
      "Meal",
      "Chore done",
      "Absence",
      "Chore",
      "Category",
      "Rule",
    ]);
  });

  it("never offers a member an option that would open and then refuse", () => {
    const member = labels(quickAddOptions({ isAdmin: false, isLead: false }));

    expect(member).not.toContain("Rule");
    expect(member).not.toContain("Chore");
    expect(member).not.toContain("Category");
  });

  it("points every option at a route that takes it straight to the form", () => {
    const options = quickAddOptions({ isAdmin: true, isLead: true });

    expect(options.map((option) => option.href)).toEqual([
      "/expenses?add=1",
      "/food?add=1",
      "/chores/mine",
      "/house/away",
      "/admin/chores",
      "/house/categories",
      "/more/rules/new",
    ]);
  });
});
