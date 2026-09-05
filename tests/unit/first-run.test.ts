import { describe, expect, it } from "vitest";
import { shouldShowFirstRun, type FirstRunStep } from "@/components/home/first-run";

/**
 * The checklist a new Home gets on its front page.
 *
 * The rule worth testing is when it stops appearing. It has no dismiss button
 * on purpose — a Home in use has finished the list by definition — so if this
 * predicate is wrong the block either never leaves an established household's
 * Home screen, or never shows up on a new one.
 */

const step = (id: string, done: boolean): FirstRunStep => ({
  id,
  title: id,
  body: id,
  href: `/${id}`,
  done,
});

describe("shouldShowFirstRun", () => {
  it("shows on a Home where nothing has been set up", () => {
    expect(
      shouldShowFirstRun([
        step("chores", false),
        step("rooms", false),
        step("invite", false),
        step("expense", false),
      ]),
    ).toBe(true);
  });

  it("still shows while two are outstanding", () => {
    expect(
      shouldShowFirstRun([
        step("chores", true),
        step("rooms", true),
        step("invite", false),
        step("expense", false),
      ]),
    ).toBe(true);
  });

  it("goes away once only one loose end is left", () => {
    expect(
      shouldShowFirstRun([
        step("chores", true),
        step("rooms", true),
        step("invite", true),
        step("expense", false),
      ]),
    ).toBe(false);
  });

  it("goes away entirely on a Home that is running", () => {
    expect(
      shouldShowFirstRun([
        step("chores", true),
        step("rooms", true),
        step("invite", true),
        step("expense", true),
      ]),
    ).toBe(false);
  });

  it("never shows for a member, who is only ever offered one of the steps", () => {
    // A member sees the expense step and nothing else, so the list cannot
    // reach two outstanding — the checklist is an admin's by construction.
    expect(shouldShowFirstRun([step("expense", false)])).toBe(false);
  });
});
