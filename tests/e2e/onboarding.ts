import { expect, type Page } from "@playwright/test";

/**
 * The onboarding walk, in one place.
 *
 * Every journey starts by making an account and a Home, and every one of them
 * used to write that sequence out again — six copies of the same six steps. So
 * when onboarding was cut from seven required steps to three, all six journeys
 * broke at once and each had to be edited separately.
 *
 * It lives here now. A navigation change costs one edit, and a journey that
 * fails after one is telling us about the screen it was actually testing.
 */

export const PASSWORD = "test-password-1";

export interface Account {
  name: string;
  username: string;
  email: string;
}

/** Create an account and land wherever onboarding puts a person with no Home. */
export async function signUp(page: Page, account: Account): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(account.name);
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding/**", { timeout: 30000 });

  // A Google-less sign-up sometimes lands on the username step first.
  if (page.url().includes("/onboarding/username")) {
    await page.getByLabel("Username").fill(account.username);
    // The availability check enables the button; waiting on that rather than on
    // a fixed delay is both faster and not a guess about network time.
    const claim = page.getByRole("button", { name: "Claim it" });
    await expect(claim).toBeEnabled({ timeout: 15000 });
    await claim.click();
    await page.waitForURL("**/onboarding/house", { timeout: 30000 });
  }

  // Wait for the choice to render by content rather than by a fixed delay —
  // hydration time is not something a test should guess at.
  await page.waitForSelector(
    'h1:has-text("Get started"), button:has-text("Set up a new home")',
    { timeout: 30000 },
  );
}

/**
 * Make a Home and finish onboarding.
 *
 * Three steps as of the navigation rebuild: the Home, then the two questions
 * about you, then the app. Availability, notifications and the AI key are asked
 * for at the moment they first matter instead — a person who has not yet seen a
 * chore has no idea what their availability is for.
 */
export async function createHome(page: Page, name: string): Promise<void> {
  await page.getByText("Set up a new home", { exact: true }).click();
  await page.getByLabel("Home name").fill(name);
  await page.getByRole("button", { name: "Create home" }).click();

  await page.waitForURL("**/onboarding/profile", { timeout: 30000 });
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  await page.waitForURL("**/home", { timeout: 30000 });
}

/** Sign in as somebody who already has a Home. */
export async function signIn(page: Page, identifier: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(identifier);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Sign out by clearing the cookies: the proxy treats a caller with no session
 * as signed out on the very next request.
 */
export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/signin");
  await expect(page.getByLabel("Username or email")).toBeVisible();
}

/**
 * Hide the Next.js dev-tools bubble for the rest of this page's life.
 *
 * The suite runs against `next dev`, which paints a floating button in the
 * bottom-left corner — exactly where the tab bar's first destination sits on a
 * 360px viewport. A click there hits the overlay and Playwright waits out its
 * timeout reporting an "intercepted" click, which reads precisely like a
 * product defect and is nothing of the kind. It is injected as an init script
 * so it survives every navigation the test makes.
 */
export async function hideDevOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.append(style));
    if (document.head) document.head.append(style);
  });
}
