/**
 * Phase 11 — Governance journey: propose → respond → apply.
 *
 * This is the acceptance test for docs/07-ROADMAP.md phase 11: the core
 * governance engine must allow a member to propose a decision, other members
 * to respond, and the effect to apply when the quorum is met.
 *
 * It uses a removal decision because that's the first Critical type whose
 * effect exists (via migration 050's two-state removal).
 *
 * It needs a running app pointed at a real Supabase project with the full
 * phase 11 schema (migrations 051-060). It creates three accounts per run.
 *
 *   npm run test:e2e -- tests/e2e/governance.spec.ts
 */

import { expect, test } from "@playwright/test";

const stamp = Date.now();
// Use dev login for the lead (bypasses signup), create real accounts for co-lead and member
const PASSWORD = "test-password-1";

const lead = {
  name: "Ravi Lead",
  username: `ravil${stamp}`.slice(0, 20),
  email: `ravil-${stamp}@houseos.test`,
};

const coLead = {
  name: "Kumar Co-Lead",
  username: `kumarl${stamp}`.slice(0, 20),
  email: `kumarl-${stamp}@houseos.test`,
};

const member = {
  name: "Arjun Member",
  username: `arjunl${stamp}`.slice(0, 20),
  email: `arjunl-${stamp}@houseos.test`,
};

type Account = { name: string; username: string; email: string };

async function signUp(page: import("@playwright/test").Page, account: Account) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(account.name);
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  
  // Wait for network to be idle after form submission
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  
  // Handle /onboarding/username if redirected there
  if (page.url().includes("/onboarding/username")) {
    console.log("At username page, filling:", account.username);
    await page.getByLabel("Username").fill(account.username);
    
    // Wait for the availability check to complete
    await page.waitForTimeout(3000);
    
    // The button says "Claim it" not "Continue"
    const claimBtn = page.getByRole("button", { name: "Claim it" });
    const isDisabled = await claimBtn.isDisabled().catch(() => true);
    console.log("Claim button disabled:", isDisabled);
    
    if (!isDisabled) {
      await claimBtn.click();
    } else {
      // Wait longer for availability check
      await page.waitForTimeout(5000);
      const stillDisabled = await claimBtn.isDisabled().catch(() => true);
      console.log("Claim button still disabled:", stillDisabled);
      if (stillDisabled) {
        const pageText = await page.textContent("body").catch(() => "");
        console.log("Username page text:", pageText?.slice(0, 1000));
        throw new Error("Claim button is disabled - username may be taken or invalid");
      }
      await claimBtn.click();
    }
    
    await page.waitForURL("**/onboarding/house", { timeout: 15000 });
  } else if (page.url().includes("/signup")) {
    const pageText = await page.textContent("body").catch(() => "");
    console.log("Signup page text:", pageText?.slice(0, 500));
    throw new Error("Signup failed - still on signup page");
  }
  
  await page.waitForURL("**/onboarding/house", { timeout: 15000 });
  console.log("After signup/username URL:", page.url());
}

async function signIn(page: import("@playwright/test").Page, identifier: string) {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(identifier);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

async function createHome(page: import("@playwright/test").Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('h1:has-text("Get started"), button:has-text("Set up a new home")', { timeout: 30000 });
  await page.getByText("Set up a new home", { exact: true }).click();
  await page.getByLabel("Home name").fill(name);
  await page.getByRole("button", { name: "Create home" }).click();
  await page.waitForURL("**/onboarding/ai");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForURL("**/onboarding/profile");
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL("**/onboarding/availability");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL("**/onboarding/notify");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe.configure({ mode: "serial" });

let homeName = "";

test("lead creates home and adds co-lead + member", async ({ page }) => {
  // Lead signs up and creates home
  await signUp(page, lead);
  homeName = `Gov Home ${stamp}`;
  await createHome(page, homeName);

  // The link is what a person is sent. It lives on admin/settings, not the
  // members list (member-list.tsx has no invite affordance).
  await page.goto("/admin/settings");
  const inviteLink = await page.getByText(/\/join\//).first().innerText();
  const invitePath = new URL(inviteLink).pathname;

  // Sign up co-lead and join
  await signUp(page, coLead);
  await page.goto(invitePath);
  await page.getByRole("button", { name: /Ask to join/ }).click();
  await page.waitForURL("**/onboarding/pending");

  // Lead accepts co-lead
  await signIn(page, lead.username);
  await page.goto("/house/members");
  await page.getByRole("button", { name: "Let them in" }).first().click();
  await page.getByRole("button", { name: "Make Co-Admin" }).first().click();

  // Sign up member
  await signUp(page, member);
  await page.goto(invitePath);
  await page.getByRole("button", { name: /Ask to join/ }).click();
  await page.waitForURL("**/onboarding/pending");

  // Lead accepts member
  await signIn(page, lead.username);
  await page.goto("/house/members");
  await page.getByRole("button", { name: "Let them in" }).first().click();
});

test("lead proposes removal of member (Critical decision)", async ({ page }) => {
  await signIn(page, lead.username);
  await page.waitForURL("**/dashboard");
  await page.goto("/house/members");

  // Click the member's menu and choose "Remove"
  await page.getByRole("row", { name: member.name }).getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();

  // The proposer sheet (S-37) should open
  await expect(page.getByText("Nothing changes until they respond")).toBeVisible();
  await expect(page.getByText("This is a Critical decision")).toBeVisible();
  await expect(page.getByText("It needs the Co-Admin's approval")).toBeVisible();

  // Lead submits the proposal with a reason
  await page.getByLabel("Reason").fill("They never do their chores");
  await page.getByRole("button", { name: "Propose" }).click();

  // Should navigate to the decision detail or approvals screen
  await page.waitForURL("**/more/approvals/**");
});

test("co-lead approves the removal", async ({ page }) => {
  await signIn(page, coLead.username);
  await page.waitForURL("**/dashboard");

  // Navigate to Approvals
  await page.goto("/more/approvals");
  await expect(page.getByText("Removal")).toBeVisible();
  await page.getByRole("link", { name: member.name }).click();

  // Decision detail page (S-36)
  await expect(page.getByText("Removing a member")).toBeVisible();
  await expect(page.getByText("It needs the Co-Admin's approval")).toBeVisible();

  // Co-lead approves
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByLabel("Reason (optional)").fill("Agreed, they never showed up");
  await page.getByRole("button", { name: "Confirm approval" }).click();

  // Should show the decision as approved
  await expect(page.getByText("Approved")).toBeVisible();
  await expect(page.getByText("Applied")).toBeVisible({ timeout: 10_000 });
});

test("removal is applied — member becomes Inactive with pending_settlement", async ({ page }) => {
  await signIn(page, lead.username);
  await page.goto("/house/members");

  // The removed member should show as Inactive with pending settlement
  await expect(page.getByText(member.name)).toBeVisible();
  await expect(page.getByText("Inactive")).toBeVisible();
  await expect(page.getByText("Pending settlement")).toBeVisible();
});

test("every screen works at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, lead.email);
  await page.waitForURL("**/dashboard");

  for (const path of [
    "/dashboard",
    "/more/approvals",
    "/house/members",
    "/admin/settings",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls horizontally at 360 px`).toBeLessThanOrEqual(0);
  }
});