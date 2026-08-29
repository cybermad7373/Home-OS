import { expect, test } from "@playwright/test";

/**
 * Phase-12 acceptance, run rather than read (docs/07-ROADMAP.md phase 12):
 * an Admin writes a rule in plain English, submits it, the Home is asked, and
 * only once it is answered does the rule read as in force.
 *
 * The journey is deliberately walked in a Home of one. That is the shape where
 * the specification's exception applies — there is nobody to ask, so the
 * decision auto-approves and the effect runs on the spot — and it is the only
 * shape a single browser can walk end to end. What it proves is the part that
 * is the same at every Home size: **the rule goes live through a decision, and
 * the version history exists from the first version.** The multi-person path,
 * where the rule sits `Waiting for the house` until a Co-Admin answers, is
 * covered by `tests/integration/rules.test.ts`, which can hold two sessions at
 * once.
 *
 * It needs a running app pointed at a real Supabase project with email sign-up
 * enabled and email confirmation switched off — the local stack, or a scratch
 * project. It creates one account per run.
 *
 *   npm run test:e2e -- rules
 */

const stamp = Date.now();
const PASSWORD = "test-password-1";

const admin = {
  name: "Rules Admin",
  username: `rules${stamp}`.slice(0, 20),
  email: `rules-${stamp}@houseos.test`,
};

const RULE_TEXT =
  "Nobody should leave unwashed vessels overnight. If someone does, they clean the kitchen next morning.";
const RULE_TITLE = `Unwashed vessels ${stamp}`;
const EDITED_TITLE = `Unwashed vessels, revised ${stamp}`;

test.describe.configure({ mode: "serial" });

/**
 * Each test gets a fresh browser context, so the session from the previous one
 * is gone. Signing in again is cheaper and clearer than sharing storage state,
 * and it means any one of these can be run on its own after the first.
 */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(admin.username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home");
}

test("an admin creates a home", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(admin.name);
  await page.getByLabel("Username").fill(admin.username);
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding/house");

  await page.getByText("Set up a new home").click();
  await page.getByLabel("Home name").fill(`Rules Home ${stamp}`);
  await page.getByRole("button", { name: "Create home" }).click();

  // The AI step comes first and skipping is the expected path — a Home with no
  // key writes the same rules through the same form (RL-08), which is exactly
  // what the rest of this journey walks.
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

test("the rules screen is reachable from More, and starts empty", async ({ page }) => {
  await signIn(page);
  await page.goto("/more");
  await page.getByRole("link", { name: /House rules/ }).click();

  await page.waitForURL("**/more/rules");
  await expect(page.getByRole("heading", { name: "House rules" })).toBeVisible();
  await expect(page.getByText("No rules yet")).toBeVisible();
});

test("a rule is written in plain words and submitted to the home", async ({ page }) => {
  await signIn(page);
  await page.goto("/more/rules/new");

  // The text area comes first, and it is the rule. Everything below it is a
  // reading of it that a person checks.
  await page.getByLabel("The rule, in your own words").fill(RULE_TEXT);
  await page.getByLabel(/^Name/).fill(RULE_TITLE);

  await page.getByLabel("When", { exact: true }).selectOption("state_at_time");
  await page.getByLabel("What, and when").fill("unwashed vessels at end of day");
  await page.getByLabel("Then", { exact: true }).selectOption("task");
  await page.getByLabel("What happens").fill("Clean the kitchen next morning");
  await page.getByLabel("Applies to", { exact: true }).selectOption("responsible_person");

  await page.getByRole("button", { name: "Submit", exact: true }).click();

  // S-37. The rule does not go live on the form — the sheet is where the Home
  // is asked, and it says so before anything is sent.
  await expect(page.getByRole("dialog", { name: "Add this rule" })).toBeVisible();
  await expect(page.getByText(/It is not a rule until they answer/)).toBeVisible();

  await page.getByLabel(/^Why\?/).fill("We keep arguing about the sink");
  await page.getByRole("button", { name: "Ask the home" }).click();

  await page.waitForURL("**/more/rules");
});

test("the rule is in force, with a version and a date", async ({ page }) => {
  await signIn(page);
  await page.goto("/more/rules");

  await expect(page.getByText(RULE_TITLE)).toBeVisible();
  await expect(page.getByText("In force")).toBeVisible();
  await expect(page.getByText(/^v1/)).toBeVisible();

  // The structured reading is on the row, in the vocabulary of the screen.
  await expect(page.getByText("Clean the kitchen next morning")).toBeVisible();
  await expect(page.getByText("Whoever was responsible")).toBeVisible();
});

test("the history shows the first version verbatim", async ({ page }) => {
  await signIn(page);
  await page.goto("/more/rules");
  await page.getByRole("link", { name: "History" }).first().click();

  await page.waitForURL(/\/more\/rules\/[0-9a-f-]+\/history$/);

  // RL-09 — what the Home actually agreed to, kept exactly as it was typed.
  await expect(page.getByText(RULE_TEXT)).toBeVisible();
  await expect(page.getByText("Version 1")).toBeVisible();
  await expect(
    page.getByText("The first version. This is the rule, not a change to one."),
  ).toBeVisible();
  // Who wrote it, on the version itself rather than in the page chrome.
  await expect(page.getByText(new RegExp(`^${admin.name} · `))).toBeVisible();
});

test("editing appends a version and leaves the first one readable", async ({ page }) => {
  await signIn(page);
  await page.goto("/more/rules");
  await page.getByRole("link", { name: "Edit" }).first().click();
  await page.waitForURL(/\/more\/rules\/[0-9a-f-]+\/edit$/);

  await page.getByLabel(/^Name/).fill(EDITED_TITLE);
  await page.getByRole("button", { name: "Submit the change" }).click();

  await page.getByLabel(/^Why\?/).fill("The old name was too vague");
  await page.getByRole("button", { name: "Ask the home" }).click();
  await page.waitForURL("**/more/rules");

  await expect(page.getByText(EDITED_TITLE)).toBeVisible();
  await expect(page.getByText(/^v2/)).toBeVisible();

  await page.getByRole("link", { name: "History" }).first().click();
  await expect(page.getByText("Version 2")).toBeVisible();
  await expect(page.getByText("Version 1")).toBeVisible();
  // RL-07 — from what, to what.
  await expect(page.getByText("Name:")).toBeVisible();
  await expect(page.getByText(RULE_TITLE)).toBeVisible();
});

test("disabling is a version transition, and the rule stays readable", async ({ page }) => {
  await signIn(page);
  await page.goto("/more/rules");
  await page.getByRole("button", { name: "Disable" }).first().click();

  await expect(page.getByRole("dialog", { name: "Disable this rule" })).toBeVisible();
  await expect(page.getByText(/It stays readable, with the dates it was in force/)).toBeVisible();

  await page.getByLabel(/^Why\?/).fill("Everyone does it now without being told");
  await page.getByRole("button", { name: "Ask the home" }).click();

  await expect(page.getByText("Disabled")).toBeVisible();
  await expect(page.getByText(EDITED_TITLE)).toBeVisible();
});

test("the rules screens work at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);

  await page.goto("/more/rules");
  const href = await page.getByRole("link", { name: "History" }).first().getAttribute("href");

  for (const path of ["/more/rules", "/more/rules/new", href!]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls horizontally at 360 px`).toBeLessThanOrEqual(0);
  }
});
