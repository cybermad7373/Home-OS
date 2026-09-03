/**
 * The screenshot set.
 *
 * `audit:ui` reports what a machine can measure — overflow, hit area, a failed
 * request, a missing heading. It cannot tell you that a screen is ugly, that a
 * figure is stranded in the middle of an empty card, or that two panels which
 * should balance do not. This script captures the evidence a person judges
 * that from: a full-page PNG of every screen, at each width, in both themes.
 *
 *   npm run shoot:ui                        # 1440px, light, every route
 *   W=390 THEME=dark npm run shoot:ui       # one width, one theme
 *   ROUTES=/home,/today npm run shoot:ui    # a subset while iterating
 *
 * Needs the app running and the demo seed applied. It reads only.
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "screenshots";
const WIDTH = Number(process.env.W ?? 1440);
const HEIGHT = Number(process.env.H ?? 900);
const THEME = process.env.THEME ?? "light";
const USER = process.env.AUDIT_USER ?? "demo";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "demo1234";
const FULL = process.env.FULL !== "0";

/** Every screen behind the login, in the order a person meets them. */
const ALL_ROUTES = [
  "/home",
  "/today",
  "/chores",
  "/chores/mine",
  "/chores/standing",
  "/chores/dependents",
  "/expenses",
  "/expenses/approvals",
  "/expenses/recurring",
  "/expenses/close",
  "/settle",
  "/money/daily",
  "/food",
  "/food/library",
  "/food/shopping",
  "/food/history",
  "/food/preferences",
  "/insights",
  "/more",
  "/more/approvals",
  "/more/decisions",
  "/more/rules",
  "/more/rules/new",
  "/more/calendar",
  "/more/game",
  "/notifications",
  "/house/members",
  "/house/rooms",
  "/house/guests",
  "/house/away",
  "/house/availability",
  "/house/categories",
  "/house/notifications",
  "/homes",
  "/admin/settings",
  "/admin/settings/ai",
  "/admin/chores",
  "/admin/schedule",
];

const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(",") : ALL_ROUTES;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  colorScheme: THEME === "dark" ? "dark" : "light",
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
await page.getByLabel("Username or email").fill(USER);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/home", { timeout: 60_000 });

let taken = 0;
for (const route of ROUTES) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Long enough for the streamed shell to settle and for `motion` entrances
    // to finish; a screenshot mid-transition is a false finding.
    await page.waitForTimeout(900);
    const name = route.replace(/\//g, "_").replace(/^_/, "") || "root";
    await page.screenshot({ path: `${OUT}/${WIDTH}-${THEME}-${name}.png`, fullPage: FULL });
    taken += 1;
  } catch (error) {
    console.log(`  failed  ${route} — ${error.message.split("\n")[0].slice(0, 120)}`);
  }
}

console.log(`${taken} of ${ROUTES.length} captured at ${WIDTH}px, ${THEME}, into ${OUT}/`);
await browser.close();
