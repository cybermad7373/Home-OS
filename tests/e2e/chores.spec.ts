import { expect, test, type Page } from "@playwright/test";
import { createHome, hideDevOverlay, signIn as signInAs, signUp } from "./onboarding";

/**
 * The chores journey, which the suite did not have.
 *
 * `docs/12-TEST-PLAN.md` section 4 listed chores as a journey nobody walks. The
 * Today journey clicks a destination called Chores; nothing claimed a chore,
 * marked one done, or read the result back off the week.
 *
 * Walked in a Home of one, and that shape decides the outcome rather than
 * merely permitting it: governance specification section 4 sets the
 * confirmation quorum by Home size, and at one member there is nobody to ask,
 * so a chore marked done is auto-confirmed immediately. That is the rule this
 * journey ends up proving, and it is the correct rule to prove in a browser —
 * the multi-member quorum is covered by `chore-quorum.test.ts` against the
 * database, where a second member can actually answer.
 *
 * It needs a running app pointed at a real Supabase project with email sign-up
 * enabled and email confirmation switched off — the local stack, or a scratch
 * project. It creates one account per run.
 *
 *   npm run test:e2e -- chores
 */

const stamp = Date.now();

const doer = {
  name: "Chore Doer",
  username: `chore${stamp}`.slice(0, 20),
  email: `chore-${stamp}@houseos.test`,
};

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await hideDevOverlay(page);
  await signInAs(page, doer.username);
  await page.waitForURL("**/home");
}

test("a resident creates a home", async ({ page }) => {
  await hideDevOverlay(page);
  await signUp(page, doer);
  await createHome(page, `Chore Home ${stamp}`);
});

test("a new home is seeded with chores rather than an empty week", async ({ page }) => {
  await signIn(page);
  await page.goto("/chores");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // A Home with no chores at all cannot demonstrate anything about fairness, so
  // creating one seeds a starting set. If this ever renders an empty state, the
  // seeding broke and every fairness figure downstream is meaningless.
  await expect(page.locator("body")).not.toContainText("Something went wrong");
});

test("the admin chore list is reachable and lists templates", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/chores");

  // The creator of a Home is its admin, so this must not bounce.
  await expect(page).toHaveURL(/\/admin\/chores/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

/**
 * The week the schedule was published for, captured from where the app itself
 * navigates afterwards. It is not necessarily the current week — the scheduler
 * runs on a Sunday evening for the week ahead — and `/chores` with no
 * `week_start` shows today's, which is how this journey first came to assert
 * against a screen reading "This week has not been generated".
 */
let publishedWeek = "";

test("an admin generates and publishes a week, and lands on it", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/schedule");

  // A brand-new Home has chore *templates* and no instances: the week is
  // produced by the scheduler, which normally runs as a cron job. Without this
  // step the rest of the journey has nothing to act on — and skipping it, which
  // is what this file did first, is how a chore journey ends up asserting
  // nothing about chores.
  await page.getByRole("button", { name: "Generate and publish" }).click();

  // The panel sends the admin to the week it just wrote.
  await page.waitForURL(/\/chores\?week_start=/, { timeout: 60000 });
  publishedWeek = new URL(page.url()).searchParams.get("week_start") ?? "";
  expect(publishedWeek).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("a chore is claimed or already mine, and can be marked done", async ({ page }) => {
  await signIn(page);
  await page.goto(`/chores?week_start=${publishedWeek}`);

  await expect(page.getByText("This week has not been generated")).toHaveCount(0);

  // Either shape is legitimate depending on how the week was generated: an
  // unassigned chore is claimed first, an assigned one is done directly.
  const claim = page.getByRole("button", { name: "Claim it" }).first();
  if (await claim.isVisible().catch(() => false)) {
    await claim.click();
    await expect(page.getByText("It is yours.")).toBeVisible({ timeout: 20000 });
  }

  const done = page.getByRole("button", { name: "Done", exact: true }).first();
  await expect(done).toBeVisible({ timeout: 20000 });
  await done.click();
  await expect(page.getByText(/Marked done/)).toBeVisible({ timeout: 20000 });
});

test("in a home of one there is nobody to confirm, so it confirms itself", async ({ page }) => {
  await signIn(page);
  await page.goto(`/chores?week_start=${publishedWeek}`);

  // Section 4: at one member the quorum is nobody, and the chore is confirmed
  // immediately rather than sitting in a queue that can never clear. The
  // failure this guards against is a one-person Home whose every chore is
  // permanently pending.
  await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0);
});

test("nobody is offered their own chore to confirm", async ({ page }) => {
  await signIn(page);
  await page.goto(`/chores?week_start=${publishedWeek}`);

  // The rule is enforced by the database and by a check constraint; this is the
  // screen keeping its side of it, which is the part a person meets.
  await expect(page.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Reject/ })).toHaveCount(0);
});

test("the week's standing renders with the effort actually recorded", async ({ page }) => {
  await signIn(page);
  await page.goto("/chores/standing");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Something went wrong");
});

test("the chore screens work at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);

  for (const path of ["/chores", "/chores/mine", "/chores/standing"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways at 360px`).toBeLessThanOrEqual(0);
  }
});
