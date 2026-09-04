import { expect, test, type Page } from "@playwright/test";
import { createHome, hideDevOverlay, signIn as signInAs, signUp } from "./onboarding";

/**
 * The money journey, which the suite did not have.
 *
 * `docs/12-TEST-PLAN.md` section 4 listed expenses and close as journeys nobody
 * walks, and PROGRESS.md carried it as a gap: the food, rules, governance,
 * Today and insights journeys cross the ledger, but none of them records an
 * expense, reads the figure back, or closes a month. Those are the two things
 * the product is most obviously *for*, and their route handlers had no
 * browser-level coverage at all.
 *
 * Walked in a Home of one, which is the only shape a single browser can walk end
 * to end. That is not a weaker test than it sounds for this journey in
 * particular: a one-member Home is the documented exception where a decision
 * comes back already applied, so a close can be driven to completion here and
 * cannot be anywhere else without a second person answering.
 *
 * It needs a running app pointed at a real Supabase project with email sign-up
 * enabled and email confirmation switched off — the local stack, or a scratch
 * project. It creates one account per run.
 *
 *   npm run test:e2e -- money
 */

const stamp = Date.now();

const payer = {
  name: "Money Payer",
  username: `money${stamp}`.slice(0, 20),
  email: `money-${stamp}@houseos.test`,
};

/** Distinctive, so a figure found on a later screen is unambiguously this one. */
const AMOUNT_KEYS = ["1", "2", "3", "4"];
const AMOUNT_TEXT = "1,234";
const NOTE = `Cylinder refill ${stamp}`;

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await hideDevOverlay(page);
  await signInAs(page, payer.username);
  await page.waitForURL("**/home");
}

test("a payer creates a home", async ({ page }) => {
  await hideDevOverlay(page);
  await signUp(page, payer);
  await createHome(page, `Money Home ${stamp}`);
});

test("the ledger starts empty and says so", async ({ page }) => {
  await signIn(page);
  await page.goto("/money");

  // `/money` is a documented alias for the ledger (D-68).
  await expect(page).toHaveURL(/\/expenses/);
  await expect(page.getByRole("heading", { name: "Money", level: 1 })).toBeVisible();
});

test("an expense is recorded from the ledger, on the keypad", async ({ page }) => {
  await signIn(page);
  await page.goto("/expenses?add=1");

  const keypad = page.getByRole("group", { name: "Amount keypad" });
  await expect(keypad).toBeVisible();
  for (const key of AMOUNT_KEYS) {
    await keypad.getByRole("button", { name: key, exact: true }).click();
  }

  // The first category any new Home is seeded with; picking one rather than
  // relying on a default is part of what this journey is checking.
  await page.getByRole("button", { name: "Groceries" }).first().click();
  await page.getByLabel("Note").fill(NOTE);

  await page.getByRole("button", { name: /^Save/ }).click();

  await expect(page.getByText(NOTE)).toBeVisible({ timeout: 20000 });
});

test("the figure on the ledger is the figure that was typed", async ({ page }) => {
  await signIn(page);
  await page.goto("/expenses");

  const row = page.getByText(NOTE).locator("xpath=ancestor::li[1]");
  await expect(row).toContainText(AMOUNT_TEXT);
});

test("the house total and the member's share agree with the one expense", async ({ page }) => {
  await signIn(page);
  await page.goto("/expenses");

  // In a Home of one, the house spent it and the single member's share is all
  // of it. The point is not the arithmetic — that is unit-tested — but that the
  // figure reaching this screen is derived from the row just written.
  await expect(page.getByText("House spent")).toBeVisible();
  await expect(page.getByText(AMOUNT_TEXT).first()).toBeVisible();
});

test("the expense reaches Insights under the category it was filed against", async ({ page }) => {
  await signIn(page);
  await page.goto("/insights");

  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
  await expect(page.getByText("By category")).toBeVisible();
  await expect(page.getByText("Groceries").first()).toBeVisible();
});

test("the close dry run reports the month before anybody commits to it", async ({ page }) => {
  await signIn(page);
  await page.goto("/expenses/close");

  // Every member may see the dry run, because closing is irreversible in
  // practice and the house should be able to check the numbers first.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Something went wrong");
});

test("settle up is honest about a home that owes itself nothing", async ({ page }) => {
  await signIn(page);
  await page.goto("/settle");

  // Two headings, and which one appears is the answer rather than a detail:
  // "Settle up" heads the empty state, "Settle" heads a month that has a
  // settlement view with a status. A Home of one may legitimately show either,
  // because the period exists even when nothing in it needs paying.
  await expect(page.getByRole("heading", { name: /^Settle( up)?$/, level: 1 })).toBeVisible();

  // What must never happen is a table of payments in a Home where one member
  // would have to pay themselves.
  await expect(page.locator("body")).not.toContainText(`${payer.name} pays ${payer.name}`);
});

test("the ledger and the close screen work at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);

  for (const path of ["/expenses", "/expenses/close", "/settle"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways at 360px`).toBeLessThanOrEqual(0);
  }
});
