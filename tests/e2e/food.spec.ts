import { expect, test } from "@playwright/test";

/**
 * Phase-13 acceptance, run rather than read (docs/07-ROADMAP.md phase 13):
 * a meal recorded with only a name and a date is a valid meal (section 8.1),
 * a fuller meal with a cost saves to the library and its per-person cost
 * divides exactly, and both show up in Meal History and the Food Library.
 *
 * Walked in a Home of one — the only shape a single browser can walk end to
 * end — so the participant list is one person and the per-person cost equals
 * the total. That is still the property worth proving here: the split
 * arithmetic runs and the number that reaches the screen is the number that
 * was typed in, not a fraction of it.
 *
 * It needs a running app pointed at a real Supabase project with email
 * sign-up enabled and email confirmation switched off — the local stack, or a
 * scratch project. It creates one account per run.
 *
 *   npm run test:e2e -- food
 */

const stamp = Date.now();
const PASSWORD = "test-password-1";

const cook = {
  name: "Food Cook",
  username: `food${stamp}`.slice(0, 20),
  email: `food-${stamp}@houseos.test`,
};

const BARE_MEAL_NAME = `Curd Rice ${stamp}`;
const COSTED_MEAL_NAME = `Paruppu Sadham ${stamp}`;
const RESTRICTION_ITEM = "Peanut";

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(cook.username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

test("a cook creates a home", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(cook.name);
  await page.getByLabel("Username").fill(cook.username);
  await page.getByLabel("Email").fill(cook.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding/house");

  await page.getByText("Set up a new home").click();
  await page.getByLabel("Home name").fill(`Food Home ${stamp}`);
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

  await page.waitForURL("**/dashboard");
});

test("a meal with only a name and a date is a valid meal", async ({ page }) => {
  await signIn(page);
  await page.goto("/food");

  await page.getByRole("button", { name: "Add Meal" }).click();
  await page.getByLabel("Name").fill(BARE_MEAL_NAME);
  // Deselect no one — the only member defaults to selected — and leave every
  // other field at its default. Save should still succeed.
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(`${BARE_MEAL_NAME} added to today's food history.`)).toBeVisible();
});

test("a fuller meal splits its cost, and saves to the library", async ({ page }) => {
  await signIn(page);
  await page.goto("/food");

  await page.getByRole("button", { name: "Add Meal" }).click();
  await page.getByLabel("Name").fill(COSTED_MEAL_NAME);
  await page.getByText("Tap to enter a cost (optional)").click();
  await page.getByLabel("Base").fill("180");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${COSTED_MEAL_NAME} added to today's food history.`)).toBeVisible();
});

test("both meals appear in Meal History", async ({ page }) => {
  await signIn(page);
  await page.goto("/food/history");

  await expect(page.getByText(BARE_MEAL_NAME)).toBeVisible();
  await expect(page.getByText(COSTED_MEAL_NAME)).toBeVisible();
  // One member, the whole ₹180 base cost — the split is exact, not fractional.
  await expect(page.getByText("₹180")).toBeVisible();
});

test("the costed meal saved itself to the Food Library", async ({ page }) => {
  await signIn(page);
  await page.goto("/food/library");

  await expect(page.getByText(COSTED_MEAL_NAME)).toBeVisible();
  await expect(page.getByText(BARE_MEAL_NAME)).toBeVisible();
});

test("a restriction is added on Preferences, and stays there", async ({ page }) => {
  await signIn(page);
  await page.goto("/food/preferences");

  await page.getByLabel("Item").fill(RESTRICTION_ITEM);
  await page.getByLabel("Severity").selectOption("allergy");
  await page.getByRole("button", { name: "Add restriction" }).click();

  await expect(page.getByText(`${RESTRICTION_ITEM} · Allergy`)).toBeVisible();

  await page.reload();
  await expect(page.getByText(`${RESTRICTION_ITEM} · Allergy`)).toBeVisible();
});

test("the Food screen renders Try Today's suggestions without erroring", async ({ page }) => {
  await signIn(page);
  await page.goto("/food");

  await expect(page.getByText("Suggestions")).toBeVisible();
  // Fewer than five recorded meals: the honest cold-start message, not a
  // fabricated score (section 6.1).
  await expect(page.getByText(/not enough history yet/i)).toBeVisible();
});

test("a library food can be planned, and appears under Planned", async ({ page }) => {
  await signIn(page);
  await page.goto("/food/library");

  await page.getByRole("button", { name: `Plan ${COSTED_MEAL_NAME}` }).click();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByText(`${COSTED_MEAL_NAME} planned for`)).toBeVisible();

  await page.goto("/food");
  await expect(page.getByText("Planned for")).toBeVisible();
});

test("confirming a plan as eaten creates a meal and clears it from Planned", async ({ page }) => {
  await signIn(page);
  await page.goto("/food");

  await page.getByRole("button", { name: `Confirm ${COSTED_MEAL_NAME} as eaten` }).click();
  await page.getByRole("button", { name: "Confirm as eaten" }).click();

  await expect(page.getByText(`${COSTED_MEAL_NAME} confirmed as eaten.`)).toBeVisible();
  await expect(page.getByText("Nothing planned")).toBeVisible();
});
