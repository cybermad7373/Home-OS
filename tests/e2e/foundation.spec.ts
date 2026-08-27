import { expect, test } from "@playwright/test";

/**
 * Phase-1 acceptance, run rather than read (docs/07-ROADMAP.md section 6):
 * an admin creates a house, a second person joins by code, and the admin
 * approves them.
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
  await page.waitForURL("**/onboarding/house");
}

async function signIn(page: import("@playwright/test").Page, identifier: string) {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(identifier);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe.configure({ mode: "serial" });

let inviteCode = "";

test("an admin creates a house", async ({ page }) => {
  await signUp(page, admin);

  await page.getByText("Create a new house").click();
  await page.getByLabel("House name").fill(`Anna Nagar ${stamp}`);
  await page.getByRole("button", { name: "Create house" }).click();

  await page.waitForURL("**/onboarding/profile");
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: `Anna Nagar ${stamp}` })).toBeVisible();

  await page.goto("/house/members");
  const subtitle = await page.getByText(/Invite code/).innerText();
  inviteCode = subtitle.replace("Invite code", "").trim();
  expect(inviteCode).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
});

test("a joiner waits for approval and sees nothing of the house", async ({ page }) => {
  await signUp(page, joiner);

  await page.getByText("I have an invite code").click();
  await page.getByLabel("Invite code").fill(inviteCode);
  await page.getByRole("button", { name: "Join house" }).click();

  await page.waitForURL("**/onboarding/pending");
  await expect(page.getByText("Waiting for approval")).toBeVisible();

  // BR-003 — a pending member is not a member. The app shell must refuse them.
  await page.goto("/house/rooms");
  await page.waitForURL("**/onboarding/pending");
});

test("the admin approves them and they appear in the house", async ({ page }) => {
  // Signing in by username, which is the point of the username at all.
  await signIn(page, admin.username);
  await page.waitForURL("**/dashboard");

  await page.goto("/house/members");
  await expect(page.getByText("Waiting to join")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText(joiner.name)).toBeVisible();
  await expect(page.getByText("Waiting to join")).toHaveCount(0);
});

test("every screen works at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, admin.email); // the same account, reached by email this time
  await page.waitForURL("**/dashboard");

  for (const path of ["/dashboard", "/house/members", "/house/rooms", "/more", "/admin/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls horizontally at 360 px`).toBeLessThanOrEqual(0);
  }
});
