import { expect, test } from "@playwright/test";

/**
 * Phase-14 acceptance, run rather than read (docs/07-ROADMAP.md phase 14):
 * the product stops being five disconnected screens and becomes one operating
 * system for the Home.
 *
 * The journey walks the four things the phase actually claims:
 *
 *   * `/dashboard` is retired and lands on the Home overview (S-51);
 *   * every primary destination is reachable in one tap from every other, and
 *     no screen is reachable only from a URL;
 *   * Today (S-50) answers "what is happening now", and its calendar link
 *     reaches the Calendar (S-52), whose three views all render;
 *   * the quick-add offers exactly the actions the caller is permitted —
 *     walked as an Admin, who sees all seven;
 *   * an announcement posted by a lead appears on Today and comes down again.
 *
 * Walked in a Home of one: every claim above is about navigation and
 * composition, and none of them needs a second person. It needs a running app
 * pointed at a real Supabase project with email sign-up enabled and email
 * confirmation switched off — the local stack, or a scratch project. It
 * creates one account per run.
 *
 *   npm run test:e2e -- today
 */

const stamp = Date.now();
const PASSWORD = "test-password-1";

const resident = {
  name: "Today Resident",
  username: `today${stamp}`.slice(0, 20),
  email: `today-${stamp}@houseos.test`,
};

const ANNOUNCEMENT_TITLE = `Water off ${stamp}`;

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(resident.username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");
}

test("a resident creates a home and lands on the Home overview", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(resident.name);
  await page.getByLabel("Username").fill(resident.username);
  await page.getByLabel("Email").fill(resident.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding/house");

  await page.getByText("Set up a new home").click();
  await page.getByLabel("Home name").fill(`Today Home ${stamp}`);
  await page.getByRole("button", { name: "Create home" }).click();

  await page.waitForURL("**/onboarding/ai");
  await page.getByRole("button", { name: "Skip — set it up later" }).click();

  await page.waitForURL("**/onboarding/profile");
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  await page.waitForURL("**/onboarding/availability");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await page.waitForURL("**/onboarding/notify");
  await page.getByRole("button", { name: "Skip for now" }).click();

  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { name: "Go to" })).toBeVisible();
});

test("the retired /dashboard lands on the Home overview", async ({ page }) => {
  await signIn(page);

  await page.goto("/dashboard");
  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { name: "Go to" })).toBeVisible();
});

test("every primary destination is one tap from the Home overview", async ({ page }) => {
  await signIn(page);
  await page.goto("/home");

  for (const [label, path] of [
    ["Today", "/today"],
    ["Chores", "/chores"],
    ["Money", "/expenses"],
    ["Food", "/food"],
    ["Calendar", "/more/calendar"],
    ["More", "/more"],
  ] as const) {
    await page.goto("/home");
    // The entry-point grid, not the tab bar: this is the claim that no screen
    // in the app is reachable only from a URL.
    await page.getByRole("heading", { name: "Go to" }).scrollIntoViewIfNeeded();
    await page
      .getByRole("main")
      .getByRole("link", { name: label, exact: true })
      .click();
    await page.waitForURL(`**${path}`);
  }
});

test("Today answers what is happening now", async ({ page }) => {
  await signIn(page);
  await page.goto("/today");

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  // People and Food are the two blocks that are always there: presence is a
  // fact about every day, and Food's prompt is the point of the block.
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Food" })).toBeVisible();
  await expect(page.getByText("1 home")).toBeVisible();
});

test("the calendar link reaches all three views", async ({ page }) => {
  await signIn(page);
  await page.goto("/today");

  await page.getByRole("link", { name: "View calendar →" }).click();
  await page.waitForURL("**/more/calendar**");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

  // Day is the default, and it always has the People card.
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

  await page.getByRole("link", { name: "Week", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The week" })).toBeVisible();

  await page.getByRole("link", { name: "Month", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chores done" })).toBeVisible();
});

test("the quick-add offers an Admin exactly the seven actions they may take", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/today");

  await page.getByRole("button", { name: "Add", exact: true }).first().click();

  // Asserted by destination rather than by label: "Chore" and "Chore done" are
  // two different options whose names contain one another.
  const sheet = page.getByRole("dialog", { name: "Add" });
  const hrefs = await sheet.getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );

  expect(hrefs).toEqual([
    "/expenses?add=1",
    "/food?add=1",
    "/chores/mine",
    "/house/away",
    "/admin/chores",
    "/house/categories",
    "/more/rules/new",
  ]);
});

test("a lead posts an announcement, and it shows on Today", async ({ page }) => {
  await signIn(page);
  await page.goto("/today");

  await page.getByRole("button", { name: "+ Post one" }).click();
  await page.getByLabel("Title").fill(ANNOUNCEMENT_TITLE);
  await page.getByLabel("What is happening").fill("Water is off from 10 AM to 2 PM.");
  await page.getByLabel("How much it matters").selectOption("important");
  await page.getByRole("button", { name: "Post to the home" }).click();

  await expect(page.getByText(ANNOUNCEMENT_TITLE)).toBeVisible();
  await expect(page.getByText("Water is off from 10 AM to 2 PM.")).toBeVisible();
});

test("the announcement comes down again", async ({ page }) => {
  await signIn(page);
  await page.goto("/today");

  await expect(page.getByText(ANNOUNCEMENT_TITLE)).toBeVisible();
  await page.getByRole("button", { name: "Take down" }).first().click();

  await expect(page.getByText(ANNOUNCEMENT_TITLE)).toHaveCount(0);
});

test("Today and the Calendar work at 360 px", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 360, height: 780 });

  for (const path of ["/home", "/today", "/more/calendar"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows horizontally at 360 px`).toBeLessThanOrEqual(0);
  }
});
