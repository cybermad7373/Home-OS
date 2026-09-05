import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signUp } from "./onboarding";

/**
 * The things a person does that nobody designed for: a mangled link, a name
 * that already exists, a note that is too long, a double-click on Save, a
 * keyboard instead of a mouse, and a session that expired while the tab was
 * open.
 *
 * Every case here was found by driving the running app and every one of them
 * was broken. Four routes answered a bad URL with a 500. A duplicate category
 * was refused with a sentence about rooms. A long note was accepted by the
 * field, priced by the preview and refused by the save. `aria-modal="true"`
 * was a claim nothing made true — fifteen tabs walked out of the sheet and into
 * the page behind it. And every `/api/*` call from a signed-out caller answered
 * with an HTML login page, so a `fetch` in an expired tab threw on `.json()`
 * and the screen said "That did not work".
 */

const stamp = Date.now();

const owner = {
  name: "Edge Owner",
  username: `edge${stamp}`.slice(0, 20),
  email: `edge-${stamp}@houseos.test`,
};

const home = `Edge Home ${stamp}`;

test.describe.configure({ mode: "serial" });

async function enter(page: Page): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Username or email").fill(owner.username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/homes", { timeout: 30000 });
  await page.getByRole("button", { name: `Enter ${home}` }).click();
  await page.waitForURL("**/home", { timeout: 30000 });
}

test("a home to break things in", async ({ page }) => {
  await signUp(page, owner);
  await page.getByText("Set up a new home").click();
  await page.getByLabel("Home name").fill(home);
  await page.getByRole("button", { name: "Create home" }).click();
  await page.waitForURL("**/onboarding/profile");
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL("**/home");
});

test("a mangled URL is a 404 or a shrug, never a 500", async ({ page }) => {
  await enter(page);

  // A path segment that cannot be an id names nothing.
  for (const path of [
    "/more/approvals/not-a-uuid",
    "/more/rules/not-a-uuid/history",
    "/more/rules/11111111-1111-4111-8111-111111111111/history",
    "/more/rules/11111111-1111-4111-8111-111111111111/edit",
  ]) {
    await page.goto(path);
    await expect(page.getByText("That page does not exist"), path).toBeVisible();
  }

  // A filter that cannot be a filter is dropped: the ledger is what was asked
  // for, and showing it unfiltered beats showing an error page.
  await page.goto("/expenses?member=not-a-uuid&category=also-not&from=nope&to=nope");
  await expect(page.getByRole("heading", { name: "Money" })).toBeVisible();

  // A week that is not a week falls back to this week rather than building a
  // range of NaN and taking the screen down with it.
  for (const week of ["not-a-date", "2026-13-45", "<script>alert(1)</script>"]) {
    await page.goto(`/chores?week_start=${encodeURIComponent(week)}`);
    await expect(page.getByRole("heading", { name: "Chores" }), week).toBeVisible();
  }
});

test("a duplicate name is refused by name, and where you can see it", async ({ page }) => {
  await enter(page);

  await page.goto("/house/categories?add=1");
  await page.getByLabel("Name").fill("Edge duplicate");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });

  await page.goto("/house/categories?add=1");
  await page.getByLabel("Name").fill("Edge duplicate");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();

  // Not "A room with that name already exists", which is what every unique
  // violation in this app used to say.
  const refusal = page.getByRole("alert").filter({ hasText: /./ }).first();
  await expect(refusal).toContainText("A category with that name already exists");
  const inView = await refusal.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  });
  expect(inView, "the refusal is on screen").toBe(true);
});

test("the expense sheet refuses in front of the button that was pressed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1093, height: 614 });
  await enter(page);
  await page.goto("/expenses?add=1");

  // The field carries the same 200 the schema does, so a long note cannot get
  // as far as the save at all.
  const note = page.getByPlaceholder("Weekly vegetables");
  await note.fill("L".repeat(400));
  expect((await note.inputValue()).length).toBe(200);

  const amount = page.getByRole("textbox", { name: "Amount" });
  await amount.fill("");
  await amount.type("99999999999");
  await page.getByRole("dialog").getByRole("button", { name: /Groceries/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Save/ }).first().click();

  const refusal = page.getByRole("dialog").getByRole("alert").first();
  await expect(refusal).toContainText(/amount between/i);
  const inView = await refusal.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  });
  expect(inView, "the refusal is beside the button, not above the scroll").toBe(true);
});

test("a double-click on Save books one expense, not two", async ({ page }) => {
  await enter(page);
  await page.goto("/expenses?add=1");

  const description = `DOUBLE-${stamp}`;
  const amount = page.getByRole("textbox", { name: "Amount" });
  await amount.fill("");
  await amount.type("42");
  await page.getByRole("dialog").getByRole("button", { name: /Groceries/ }).click();
  await page.getByPlaceholder("Weekly vegetables").fill(description);

  const posts: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (response.request().method() === "POST" && /\/api\/expenses$/.test(url)) {
      posts.push(String(response.status()));
    }
  });

  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Save/ })
    .first()
    .click({ clickCount: 2, delay: 15 });

  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });
  expect(posts, "one request, not two").toHaveLength(1);

  await page.goto("/expenses");
  await expect(page.getByText(description)).toHaveCount(1);
});

test("a sheet takes the keyboard, keeps it, and gives it back", async ({ page }) => {
  await enter(page);

  const add = page.getByRole("button", { name: "Add", exact: true }).first();
  await add.focus();
  await page.keyboard.press("Enter");

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const dialog = document.querySelector("[role=dialog]");
          return dialog ? dialog.contains(document.activeElement) : false;
        }),
      { message: "focus moved into the sheet", timeout: 10000 },
    )
    .toBe(true);

  // aria-modal="true" says everything behind is inert. Tab has to agree.
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("Tab");
  }
  expect(
    await page.evaluate(() => {
      const dialog = document.querySelector("[role=dialog]");
      return dialog ? dialog.contains(document.activeElement) : false;
    }),
    "focus stayed in the sheet",
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // The accessible name, not the text. On a phone the control that opens this
  // is the raised centre button of the tab bar: an icon and an `aria-label`,
  // with no text content at all, so reading `textContent` asked the wrong
  // question and got "" back from a button that had been focused correctly.
  expect(
    await page.evaluate(() => {
      const active = document.activeElement;
      return (active?.getAttribute("aria-label") ?? active?.textContent ?? "").trim();
    }),
    "focus went back to the control that opened it",
  ).toContain("Add");
});

test("the amount field is where the keyboard lands", async ({ page }) => {
  await enter(page);
  await page.goto("/expenses?add=1");

  // Polled: focus is moved by an effect, and `goto` resolves before hydration.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label")), {
      timeout: 10000,
    })
    .toBe("Amount");

  // The digits land in the field, which is the whole claim. The button's own
  // words depend on the Home's approval threshold — in a brand-new Home ₹250
  // already needs one — so the field is what this asserts.
  await page.keyboard.type("250");
  await expect(page.getByRole("textbox", { name: "Amount" })).toHaveValue("250");
});

test("an expired session is answered, not redirected into HTML", async ({ page }) => {
  await enter(page);
  await page.context().clearCookies();

  const response = await page.request.get("/api/homes", { maxRedirects: 0 });
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("json");
  const body = await response.json();
  expect(body.error.code).toBe("UNAUTHENTICATED");
  expect(body.error.message).toMatch(/signed out/i);
});

test("a member is refused by the API, not only by the screen", async ({ page }) => {
  // The owner is an admin of their own Home, so this asserts the other half:
  // the endpoints answer with a reason and a 4xx rather than a 500 or a 200.
  await enter(page);

  const foreign = await page.request.post("/api/homes/select", {
    data: { house_id: "11111111-1111-4111-8111-111111111111" },
  });
  expect(foreign.status()).toBe(403);
  expect((await foreign.json()).error.code).toBe("NOT_HOUSE_MEMBER");
});

test("the account screen says what deletion keeps, and why it is refused", async ({
  page,
}) => {
  await enter(page);
  await page.goto("/more/account");

  // What survives, before the button. The reason somebody presses it is
  // usually a belief about what it will remove, and an expense they paid is
  // not theirs to withdraw.
  await expect(page.getByText("Former member")).toBeVisible();

  // This account is an active member of its own Home, so deletion is refused
  // here rather than after they type their username — and the refusal names
  // the Home, because "leave your Homes first" is useless advice otherwise.
  const refusal = page.getByRole("status").filter({ hasText: "Leave your Homes first" });
  await expect(refusal).toBeVisible();
  // The Home is named inside the refusal, not merely somewhere on the page —
  // the header carries it too, which is not the same claim.
  await expect(refusal.getByText(home)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
});
