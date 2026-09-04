/**
 * The task pass.
 *
 * `audit:ui` measures a screen and `shoot:ui` photographs one. Neither answers
 * the question a person actually asks about software they have to live with:
 * can I get the thing done, and how much did it cost me to do it?
 *
 * So this drives the app as a housemate rather than as a test suite. Each task
 * is a sentence somebody would say — "I paid for the gas, put it in" — and what
 * it records is the count a person feels: how many times they had to interact,
 * how many screens they passed through, and whether the thing they came to do
 * actually happened. A task that needs nine taps is not broken, and it is worth
 * knowing about.
 *
 *   npm run uat:tasks
 *   BASE=http://localhost:3100 npm run uat:tasks
 *
 * Needs the app running and the demo seed applied. Tasks that would write to
 * the database are marked `writes` and are skipped unless WRITE=1, so the
 * default run is safe to repeat against a seeded stack.
 */

import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const USER = process.env.AUDIT_USER ?? "demo";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "demo1234";
const ALLOW_WRITES = process.env.WRITE === "1";
const WIDTH = Number(process.env.W ?? 1440);
const HEIGHT = Number(process.env.H ?? 900);

const results = [];

/** One interaction a person would count: a tap, a keystroke run, a scroll to find. */
class Journey {
  constructor(page, name, question) {
    this.page = page;
    this.name = name;
    this.question = question;
    this.interactions = 0;
    this.screens = new Set();
    this.notes = [];
  }

  note(text) {
    this.notes.push(text);
  }

  async go(path) {
    await this.page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await this.page.waitForTimeout(600);
    this.screens.add(new URL(this.page.url()).pathname);
  }

  async tap(locator, what) {
    await locator.click({ timeout: 15_000 });
    this.interactions += 1;
    await this.page.waitForTimeout(500);
    this.screens.add(new URL(this.page.url()).pathname);
    if (what) this.note(`tapped ${what}`);
  }

  async type(locator, text, what) {
    await locator.fill(text, { timeout: 15_000 });
    this.interactions += 1;
    if (what) this.note(`typed ${what}`);
  }
}

async function run(page, name, question, body, options = {}) {
  const journey = new Journey(page, name, question);
  const started = Date.now();
  let outcome = "done";
  let detail = "";

  if (options.writes && !ALLOW_WRITES) {
    results.push({ name, question, outcome: "skipped", detail: "writes; set WRITE=1", interactions: 0, screens: 0, ms: 0, notes: [] });
    return;
  }

  try {
    detail = (await body(journey)) ?? "";
  } catch (error) {
    outcome = "blocked";
    detail = error.message.split("\n")[0].slice(0, 160);
  }

  results.push({
    name,
    question,
    outcome,
    detail,
    interactions: journey.interactions,
    screens: journey.screens.size,
    ms: Date.now() - started,
    notes: journey.notes,
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();

// Signing in is itself a task, and the first one anybody performs.
await run(page, "Sign in", "Can I get in?", async (journey) => {
  await journey.go("/signin");
  await journey.type(page.getByLabel("Username or email"), USER, "username");
  await journey.type(page.getByLabel("Password"), PASSWORD, "password");
  await journey.tap(page.getByRole("button", { name: "Sign in" }), "Sign in");
  await page.waitForURL("**/home", { timeout: 60_000 });
  return `landed on ${new URL(page.url()).pathname}`;
});

await run(page, "Where do I stand", "How much is mine to pay, and to whom?", async (journey) => {
  // Two right answers, and which one a home gets is the point. A split home is
  // told what it owes or is owed; a pot home is told its share, because a pot
  // nets nothing between members and calling that a debt is the defect fixed in
  // 9de24c2. So the task looks for either, and reports which.
  const position = /you owe|you are owed|your share|your position/i;

  await journey.go("/home");
  if (await page.getByText(position).first().isVisible().catch(() => false)) {
    return "answered on the landing screen, no taps";
  }

  await journey.tap(page.getByRole("link", { name: "Money", exact: true }).first(), "Money");
  const label = await page.getByText(position).first().textContent().catch(() => null);
  return label
    ? `one tap away on Money, as "${label.trim()}"`
    : "not found on /home or Money";
});

await run(page, "What is waiting on me", "What does the house need from me?", async (journey) => {
  await journey.go("/home");
  const block = page.getByText(/waiting on you/i).first();
  if (!(await block.isVisible().catch(() => false))) return "no 'waiting on you' block on /home";
  const rows = await page.getByRole("link").filter({ hasText: /waiting on you|needs your approval|your confirmation/i }).count();
  return `${rows} items listed on the landing screen`;
});

await run(page, "Open an approval", "Something needs my approval — can I act on it?", async (journey) => {
  await journey.go("/home");
  const link = page.getByRole("link").filter({ hasText: /needs your approval/i }).first();
  if (!(await link.isVisible().catch(() => false))) return "nothing awaiting approval in the seed";
  await journey.tap(link, "the approval row");
  const acted = await page
    .getByRole("button", { name: /approve|reject|yes|no/i })
    .first()
    .isVisible()
    .catch(() => false);
  return acted
    ? `an action is on screen after ${journey.interactions} tap(s)`
    : `landed on ${new URL(page.url()).pathname} with no action visible`;
});

await run(page, "Find the add-expense form", "I paid for the gas — where do I put it?", async (journey) => {
  await journey.go("/home");
  const add = page.getByRole("button", { name: /^add$/i }).first();
  if (!(await add.isVisible().catch(() => false))) return "no Add control on /home";
  await journey.tap(add, "Add");
  // The quick-add options are links, not buttons — correctly, because they
  // navigate. Looking for a button here found nothing, the second tap never
  // happened, and the task reported that it could not reach the form.
  const expense = page.getByRole("link", { name: /expense/i }).first();
  if (await expense.isVisible().catch(() => false)) {
    await journey.tap(expense, "Expense");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);
  }
  // The amount is a keypad, not a text field — `getByLabel(/amount/i)` finds
  // nothing and an earlier version of this task reported that as a failure to
  // reach the form. It is a `role="group"` named "Amount keypad".
  const keypad = page.getByRole("group", { name: "Amount keypad" });
  const reachable = await keypad.isVisible().catch(() => false);
  return reachable
    ? `the keypad is up after ${journey.interactions} interactions from the landing screen`
    : `no amount keypad after ${journey.interactions} interactions`;
});

await run(page, "Mark a chore done", "I cooked dinner — how do I say so?", async (journey) => {
  await journey.go("/today");
  const done = page.getByRole("button", { name: /^done$/i }).first();
  const there = await done.isVisible().catch(() => false);
  return there
    ? "a Done button is on Today with no navigation at all"
    : "no Done button on Today";
});

await run(page, "Settle up", "Who do I pay, and how much?", async (journey) => {
  await journey.go("/settle");
  const amounts = await page.getByText(/₹/).count();
  if (amounts > 0) return `${amounts} figures to settle`;

  // Zero figures is the right answer for a pot home, and the screen has to say
  // so rather than render an empty table. An earlier version of this task
  // reported the zero as though it were a finding.
  const explained = await page
    .getByText(/Nobody owes anybody|shares a pot/i)
    .first()
    .isVisible()
    .catch(() => false);
  return explained
    ? "nothing to settle, and the screen says why"
    : "nothing to settle, and the screen does not say why";
});

await run(page, "Read the month", "What did the house spend, and on what?", async (journey) => {
  await journey.go("/home");
  await journey.tap(page.getByRole("link", { name: "Insights", exact: true }).first(), "Insights");
  const category = page.getByText(/by category/i).first();
  const there = await category.isVisible().catch(() => false);
  return there
    ? `category breakdown reached in ${journey.interactions} tap from the landing screen`
    : "no category breakdown on Insights";
});

await run(page, "Find one expense", "Where is that ₹3,862 electricity bill?", async (journey) => {
  await journey.go("/money");
  const row = page.getByText(/electricity/i).first();
  const there = await row.isVisible().catch(() => false);
  return there
    ? "visible on the Money ledger without filtering or searching"
    : "not visible on the Money ledger without filtering";
});

await browser.close();

// ---------------------------------------------------------------------------

const width = Math.max(...results.map((result) => result.name.length));
console.log("");
for (const result of results) {
  const mark = { done: "  ok    ", blocked: "  BLOCKED", skipped: "  --    " }[result.outcome];
  console.log(
    `${mark} ${result.name.padEnd(width)}  ${String(result.interactions).padStart(2)} taps  ${String(result.screens).padStart(2)} screens  ${result.detail}`,
  );
}

const blocked = results.filter((result) => result.outcome === "blocked");
console.log("");
console.log(
  `${results.length} tasks — ${results.filter((r) => r.outcome === "done").length} completed, ${blocked.length} blocked, ${results.filter((r) => r.outcome === "skipped").length} skipped`,
);
if (blocked.length > 0) {
  for (const result of blocked) console.log(`  blocked: ${result.name} — ${result.detail}`);
  process.exitCode = 1;
}
