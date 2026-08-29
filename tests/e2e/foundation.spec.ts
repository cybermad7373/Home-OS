import { expect, test } from "@playwright/test";

/**
 * Phase-1 and phase-10 acceptance, run rather than read
 * (docs/07-ROADMAP.md sections 6 and phase 10): an admin creates a Home, a
 * second person opens the invite link and asks to join, and a lead lets them
 * in. Along the way it proves the thing phase 10 exists for — that the person
 * asking sees nothing of the Home until somebody answers.
 *
 * It needs a running app pointed at a real Supabase project with email sign-up
 * enabled and email confirmation switched off — the local stack, or a scratch
 * project. It creates two accounts per run.
 *
 *   npm run test:e2e
 */

const stamp = Date.now();
const PASSWORD = "test-password-1";

const admin = {
  name: "Ravi Admin",
  username: `ravi${stamp}`.slice(0, 20),
  email: `ravi-${stamp}@houseos.test`,
};

const joiner = {
  name: "Kumar Joiner",
  username: `kumar${stamp}`.slice(0, 20),
  email: `kumar-${stamp}@houseos.test`,
};

type Account = { name: string; username: string; email: string };

async function signUp(page: import("@playwright/test").Page, account: Account) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(account.name);
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding/**", { timeout: 30000 });
  await page.waitForLoadState("networkidle");

  // Handle username onboarding if redirected there
  if (page.url().includes("/onboarding/username")) {
    await page.getByLabel("Username").fill(account.username);
    // Wait for username availability check to complete (button becomes enabled)
    await page.waitForTimeout(2000);
    const claimBtn = page.getByRole("button", { name: "Claim it" });
    await expect(claimBtn).toBeEnabled({ timeout: 15000 });
    await claimBtn.click();
    await page.waitForURL("**/onboarding/house", { timeout: 30000 });
    await page.waitForLoadState("networkidle");
  }

  // Wait for the JoinOrCreate component to render, by content rather than a
  // fixed delay — React hydration time is not something a test should guess.
  await page.waitForFunction(() => {
    const body = document.body.textContent || "";
    return body.includes("Set up a new home") || body.includes("Get started");
  }, { timeout: 30000 });

  await page.waitForSelector('button:has-text("Set up a new home")', { timeout: 15000 });
}

async function signIn(page: import("@playwright/test").Page, identifier: string) {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(identifier);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe.configure({ mode: "serial" });

let inviteUrl = "";

test("an admin creates a home", async ({ page }) => {
  await signUp(page, admin);

  await page.getByText("Set up a new home").click();
  await page.getByLabel("Home name").fill(`Anna Nagar ${stamp}`);
  await page.getByRole("button", { name: "Create home" }).click();

  // The AI step comes before profile and skipping is the expected path for a
  // Home with no key (RL-08's shape, exercised the same way in rules.spec.ts).
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
  await expect(page.getByRole("heading", { name: `Anna Nagar ${stamp}` })).toBeVisible();

  // The link is what a person is sent. It exists from the moment the Home does.
  await page.goto("/admin/settings");
  inviteUrl = (await page.getByText(/\/join\//).first().innerText()).trim();
  expect(inviteUrl).toMatch(/\/join\/[A-Za-z0-9_-]{16,}$/);
});

test("a joiner asks, waits, and sees nothing of the home", async ({ page }) => {
  await signUp(page, joiner);

  // Straight to the link, the way somebody who was sent one arrives.
  await page.goto(new URL(inviteUrl).pathname);
  await expect(page.getByRole("heading", { name: `Anna Nagar ${stamp}` })).toBeVisible();
  await page.getByRole("button", { name: /Ask to join/ }).click();

  await page.waitForURL("**/onboarding/pending");
  await expect(page.getByRole("heading", { name: "Waiting to be let in" })).toBeVisible();

  // HM-07 — asking is not joining. The app shell must refuse them.
  await page.goto("/house/rooms");
  await page.waitForURL("**/onboarding/pending");
});

test("a lead lets them in and they appear in the home", async ({ page }) => {
  // Signing in by username, which is the point of the username at all.
  await signIn(page, admin.username);
  await page.waitForURL("**/dashboard");

  await page.goto("/house/members");
  await expect(page.getByText("Waiting to be let in (1)")).toBeVisible();
  await page.getByRole("button", { name: "Let them in" }).click();

  await expect(page.getByText(joiner.name)).toBeVisible();
  await expect(page.getByText(/Waiting to be let in/)).toHaveCount(0);
});

test("every screen works at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, admin.email); // the same account, reached by email this time
  await page.waitForURL("**/dashboard");

  for (const path of [
    "/dashboard",
    "/homes",
    "/house/members",
    "/house/rooms",
    "/more",
    "/admin/settings",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls horizontally at 360 px`).toBeLessThanOrEqual(0);
  }
});
