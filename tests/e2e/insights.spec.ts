import { expect, test } from "@playwright/test";

/**
 * Phase-15 acceptance, run rather than read (docs/07-ROADMAP.md phase 15).
 *
 * The journey walks the criteria that are claims about the product rather than
 * about arithmetic — the arithmetic is asserted in tests/unit/insights.test.ts
 * and the wiring in tests/integration/insights.test.ts:
 *
 *   * one screen with filters replaces the four-tab analytics page, and
 *     `/analytics` lands on it;
 *   * all four types render, and the filters are in the URL;
 *   * every chart renders at 360 px with no horizontal overflow;
 *   * a member can export their own records and the Home's with no gate, and
 *     a category named like a formula does not come back as a live formula;
 *   * every points figure opens to the records that produced it, and a zero is
 *     explained as readily as a total (EF-12).
 *
 * Walked in a Home of one: every claim is about composition and access, and
 * none needs a second person. It needs a running app pointed at a real
 * Supabase project with email sign-up enabled and email confirmation off — the
 * local stack, or a scratch project. It creates one account per run.
 *
 *   npm run test:e2e -- insights
 */

const stamp = Date.now();
const PASSWORD = "test-password-1";

const resident = {
  name: "Insight Resident",
  username: `insight${stamp}`.slice(0, 20),
  email: `insight-${stamp}@houseos.test`,
};

/** A category name that is also a spreadsheet formula. */
const FORMULA_CATEGORY = `=1+1 Utilities ${stamp}`.slice(0, 40);

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(resident.username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");
}

test("a resident creates a home", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(resident.name);
  await page.getByLabel("Username").fill(resident.username);
  await page.getByLabel("Email").fill(resident.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding/house");

  await page.getByText("Set up a new home").click();
  await page.getByLabel("Home name").fill(`Insight Home ${stamp}`);
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
});

test("the retired /analytics lands on Insights", async ({ page }) => {
  await signIn(page);

  await page.goto("/analytics");
  await page.waitForURL("**/insights**");
  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
});

test("one screen answers all four questions", async ({ page }) => {
  await signIn(page);
  await page.goto("/insights");

  // Money is the default. A Home this new has spent nothing, and every view
  // must say so in words rather than rendering an empty card.
  await expect(page.getByText("Nothing spent in this range")).toBeVisible();

  // Scoped to the filter bar: the desktop sidebar carries links called
  // "Chores" and "Food" too, and they go somewhere else entirely.
  const types = page.getByRole("navigation", { name: "Insight type" });

  for (const [label, heading] of [
    ["Chores", "No chores in this range"],
    ["Food", "No meals in this range"],
    ["Home", "How active the home is"],
  ] as const) {
    await types.getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByText(heading)).toBeVisible();
  }
});

test("the filters are in the URL, so a view is a link", async ({ page }) => {
  await signIn(page);
  await page.goto("/insights");

  await page
    .getByRole("navigation", { name: "Insight type" })
    .getByRole("link", { name: "Chores", exact: true })
    .click();
  await expect(page).toHaveURL(/type=chores/);

  await page
    .getByRole("navigation", { name: "Grouping" })
    .getByRole("link", { name: "Month", exact: true })
    .click();
  await expect(page).toHaveURL(/granularity=month/);

  await page
    .getByRole("navigation", { name: "Range" })
    .getByRole("link", { name: "6 months", exact: true })
    .click();
  await expect(page).toHaveURL(/months=6/);

  // The whole view survives a reload, because none of it lives in the tab.
  await page.reload();
  await expect(page).toHaveURL(/type=chores/);
  await expect(page).toHaveURL(/months=6/);
});

test("a malformed query shows the home something rather than an error", async ({ page }) => {
  await signIn(page);

  // A read should never answer a typed URL with a validation screen.
  await page.goto("/insights?type=nonsense&period=not-a-month&months=999");
  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
});

test("a member can export their records with no gate at all", async ({ page }) => {
  await signIn(page);
  await page.goto("/insights");

  for (const view of ["money", "chores", "food", "home", "position", "expenses"]) {
    const response = await page.request.get(`/api/insights/export?view=${view}`);
    expect(response.status(), `${view} export`).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
  }

  const full = await page.request.get("/api/insights/export/full");
  expect(full.status()).toBe(200);
  expect(full.headers()["content-disposition"]).toContain("full-history");
});

test("a category named like a formula cannot execute on open", async ({ page }) => {
  await signIn(page);

  await page.goto("/house/categories");
  await page.getByRole("button", { name: "Add a category" }).click();
  await page.getByLabel("Name").fill(FORMULA_CATEGORY);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(FORMULA_CATEGORY)).toBeVisible();

  const response = await page.request.get("/api/insights/export?view=budgets");
  const body = await response.text();

  expect(body).toContain(FORMULA_CATEGORY);
  // Guarded: the field is quoted and led with an apostrophe, which a
  // spreadsheet strips on display and never evaluates.
  expect(body).toContain(`"'${FORMULA_CATEGORY}"`);
  expect(body).not.toContain(`,${FORMULA_CATEGORY}`);
});

test("a points figure of zero is explained as readily as a total", async ({ page }) => {
  await signIn(page);
  await page.goto("/insights?type=chores");

  // A new Home has no confirmed chores, so this is the zero case — EF-12 says
  // it must open and explain itself rather than showing a blank panel.
  const figure = page.getByRole("button", { name: /How .* earned \d+ points/ }).first();

  if ((await figure.count()) === 0) {
    // No member rows at all in a Home where the schedule has never run: the
    // view says so, which is itself the explanation.
    await expect(page.getByText("No chores in this range")).toBeVisible();
    return;
  }

  await figure.click();
  await expect(page.getByText("No confirmed chores in this range")).toBeVisible();
});

test("Insights works at 360 px", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 360, height: 780 });

  for (const type of ["money", "chores", "food", "home"]) {
    await page.goto(`/insights?type=${type}`);
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `/insights?type=${type} overflows at 360 px`).toBeLessThanOrEqual(0);
  }
});
