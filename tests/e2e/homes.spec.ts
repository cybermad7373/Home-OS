import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signUp } from "./onboarding";

/**
 * The Home chooser, the controls that used to be missing, and the refusal that
 * used to be silent.
 *
 * This journey exists because of what an audit of the running app turned up,
 * and every case here is one of those findings run rather than read:
 *
 *   * signing in landed in whichever Home an untotalled query returned first,
 *     so an account that administers one Home and lives in two others usually
 *     woke up in one of the two — an app with no create controls anywhere and
 *     nothing on screen saying why;
 *   * `/homes` told people to open an invite link and gave them nothing to do
 *     it with, and a second Home could only be made through onboarding, which
 *     a signed-in person cannot reach;
 *   * a member saw no Add a room and no explanation, and an admin URL typed by
 *     hand silently redirected somewhere else;
 *   * quick-add covered a third of what a Home makes, and the options it did
 *     have landed on lists rather than on forms.
 *
 * It creates two accounts and two Homes per run, on the local stack.
 */

const stamp = Date.now();

const owner = {
  name: "Asha Owner",
  username: `asha${stamp}`.slice(0, 20),
  email: `asha-${stamp}@houseos.test`,
};

const guest = {
  name: "Bala Member",
  username: `bala${stamp}`.slice(0, 20),
  email: `bala-${stamp}@houseos.test`,
};

const firstHome = `Chooser Home ${stamp}`;
const secondHome = `Second Home ${stamp}`;

test.describe.configure({ mode: "serial" });

let inviteUrl = "";

/** Sign in and stop at the chooser, rather than going through it. */
async function signInTo(page: Page, identifier: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(identifier);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/homes", { timeout: 30000 });
}

test("an owner creates a home and lands inside it", async ({ page }) => {
  await signUp(page, owner);

  await page.getByText("Set up a new home").click();
  await page.getByLabel("Home name").fill(firstHome);
  await page.getByRole("button", { name: "Create home" }).click();

  await page.waitForURL("**/onboarding/profile");
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  await page.waitForURL("**/home");

  await page.goto("/admin/settings");
  inviteUrl = (await page.getByText(/\/join\//).first().innerText()).trim();
  expect(inviteUrl).toMatch(/\/join\/[A-Za-z0-9_-]{16,}$/);
});

test("signing in asks which home, rather than choosing one", async ({ page }) => {
  await signInTo(page, owner.username);

  await expect(page.getByRole("heading", { name: "Your homes" })).toBeVisible();
  // The card carries what tells two Homes apart: the name, whether you run it,
  // and how many people are in it.
  await expect(page.getByRole("button", { name: `Enter ${firstHome}` })).toBeVisible();
  await expect(page.getByText("You run this home · 1 person")).toBeVisible();
});

test("a second home can be made from the chooser", async ({ page }) => {
  await signInTo(page, owner.username);

  await page.getByRole("button", { name: /Create a home/ }).click();
  await page.getByLabel("Home name").fill(secondHome);
  await page.getByRole("button", { name: "Create home" }).click();

  // Creating one selects it, so this lands inside the new Home rather than
  // back on the list.
  await page.waitForURL("**/home", { timeout: 30000 });
  await expect(page.getByRole("banner").getByText(secondHome)).toBeVisible();

  await page.goto("/homes");
  await expect(page.getByRole("button", { name: `Enter ${firstHome}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Enter ${secondHome}` })).toBeVisible();
});

test("the chooser is what decides which home you are in", async ({ page }) => {
  await signInTo(page, owner.username);

  await page.getByRole("button", { name: `Enter ${firstHome}` }).click();
  await page.waitForURL("**/home", { timeout: 30000 });
  await expect(page.getByRole("banner").getByText(firstHome)).toBeVisible();
});

test("quick-add reaches the things a home is set up with", async ({ page }) => {
  await signInTo(page, owner.username);
  await page.getByRole("button", { name: `Enter ${firstHome}` }).click();
  await page.waitForURL("**/home", { timeout: 30000 });

  await page.getByRole("button", { name: "Add", exact: true }).first().click();

  const sheet = page.getByRole("dialog", { name: "Add" });
  for (const label of ["Room", "Person", "Recurring expense", "Decision", "Guest"]) {
    await expect(sheet.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  // An option called Room that lands on a list of rooms has not added a room.
  await sheet.getByRole("link", { name: /^Room/ }).click();
  await page.waitForURL("**/house/rooms**", { timeout: 30000 });
  await expect(page.getByLabel("Monthly rent")).toBeVisible();
});

test("a lead can start the decisions that had no way in", async ({ page }) => {
  await signInTo(page, owner.username);
  await page.getByRole("button", { name: `Enter ${firstHome}` }).click();
  await page.waitForURL("**/home", { timeout: 30000 });

  await page.goto("/more/decisions");
  await page.getByRole("link", { name: "Ask the home" }).click();
  await page.waitForURL("**/more/decisions/new", { timeout: 30000 });

  for (const label of [
    "Change how decisions are made",
    "Change how the home works",
    "Change how chores are confirmed",
    "Set an expected contribution",
    "Start a reserve",
  ]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${label}`) })).toBeEnabled();
  }

  await page.getByRole("button", { name: /^Start a reserve/ }).click();
  await page.getByLabel("What is it for").fill("Cylinder fund");

  // Two steps on purpose: the form says what is being proposed, and the sheet
  // says who will be asked and how many of them have to answer.
  await page.locator("main").getByRole("button", { name: "Ask the home" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Critical/)).toBeVisible();
  await sheet
    .getByLabel(/^Why\?/)
    .fill("The home agreed to keep a cushion for the gas cylinder");
  await sheet.getByRole("button", { name: "Ask the home" }).click();

  // A one-person Home approves on the spot, so this lands on the decision.
  await page.waitForURL(/\/more\/approvals\/[0-9a-f-]{36}/, { timeout: 30000 });
  await expect(page.getByText("Start a reserve").first()).toBeVisible();
});

test("a member is told why, instead of being shown nothing", async ({ page }) => {
  await signUp(page, guest);

  await page.goto(new URL(inviteUrl).pathname);
  await page.getByRole("button", { name: /Ask to join/ }).click();
  await page.waitForURL("**/onboarding/pending");
});

test("the lead lets them in", async ({ page }) => {
  await signInTo(page, owner.username);
  await page.getByRole("button", { name: `Enter ${firstHome}` }).click();
  await page.waitForURL("**/home", { timeout: 30000 });

  await page.goto("/house/members");
  await page.getByRole("button", { name: "Let them in" }).click();
  await expect(page.getByText(guest.name)).toBeVisible();
});

test("the member sees a reason where the control would be", async ({ page }) => {
  await signInTo(page, guest.username);
  await page.getByRole("button", { name: `Enter ${firstHome}` }).click();
  await page.waitForURL("**/home", { timeout: 30000 });

  await page.goto("/house/rooms");
  await expect(page.getByRole("button", { name: "Add a room" })).toBeDisabled();
  await expect(page.getByText(/Only the admin of this home can add a room/)).toBeVisible();

  // A form a member may not submit is not offered eleven fields deep. This
  // screen had no check at all: a member could write the whole rule and be
  // refused by the API at the moment they sent it.
  await page.goto("/more/rules/new");
  await expect(page.getByText(/This screen is where an admin or co-admin/)).toBeVisible();

  // The admin URL typed by hand used to answer with a different screen and no
  // explanation.
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expect(page.getByRole("heading", { name: "House settings" })).toBeVisible();
  await expect(page.getByText(/This screen is where the admin of this home/)).toBeVisible();
});

test("the action a sheet exists for is visible without scrolling", async ({ page }) => {
  // A 1093x614 window is a 1366x768 laptop at 125% display scaling, which is
  // Windows' default on that panel. The add-expense Save button used to sit at
  // y≈900 in a 491px panel here: reachable by scrolling inside the sheet, never
  // visible when it opened, and the reason this app was reported as a form you
  // could fill in and could not submit.
  await page.setViewportSize({ width: 1093, height: 614 });
  await signInTo(page, owner.username);
  await page.getByRole("button", { name: `Enter ${firstHome}` }).click();
  await page.waitForURL("**/home", { timeout: 30000 });

  // Polled rather than measured once: the sheet slides up over 240ms, and a
  // control is "visible" to Playwright while it is still off the bottom of the
  // screen. What is being asserted is where it comes to rest.
  const expectInView = async (name: RegExp, what: string) => {
    const control = page.getByRole("dialog").getByRole("button", { name }).first();
    await expect(control).toBeVisible();
    await expect
      .poll(
        () =>
          control.evaluate((el) => {
            const box = el.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= window.innerHeight;
          }),
        { message: what, timeout: 5000 },
      )
      .toBe(true);
  };

  await page.goto("/expenses?add=1");
  await expectInView(/^Save/, "add an expense");

  await page.goto("/food?add=1");
  await expectInView(/^Save$/, "add a meal");

  await page.goto("/admin/chores?add=1");
  await page.getByRole("button", { name: "Add a chore" }).click();
  await expectInView(/^Save/, "add a chore");

  await page.goto("/expenses/recurring?add=1");
  await expectInView(/^Save/, "add a recurring expense");

  await page.goto("/today?add=announcement");
  await expectInView(/^Post to the home$/, "post an announcement");
});
