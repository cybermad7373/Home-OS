/**
 * The UI acceptance sweep.
 *
 * Drives every screen in the app at three widths and in both themes, signed in
 * as the seeded `demo` account, and reports what a person would see rather than
 * what the code intends: a page that scrolls sideways, a control too small to
 * hit, a request that failed behind a screen that looks fine, an error in the
 * console nobody surfaced, a rail that is not where the composition says it is.
 *
 *   npm run audit:ui                 # against http://localhost:3000
 *   BASE=http://localhost:3100 npm run audit:ui
 *
 * It needs the app running and the demo seed applied (`npm run seed`). It reads
 * only — nothing here writes to the database.
 */

import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const USER = process.env.AUDIT_USER ?? "demo";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "demo1234";

/** Minimum hit area, docs/08-UI-UX-SPEC.md section 2.3. */
const TOUCH_MIN = 44;
/** Page content cap, section 2.4. */
const CONTENT_MAX = 1120;
/** The desktop rail, section 3.6. */
const RAIL = 340;

/*
 * The widths worth sweeping, and why each is here rather than a round number.
 *
 * 320 is the smallest screen still in real use and the one every "it works on
 * mobile" claim quietly excludes. 1023 and 1024 are the `lg` boundary itself,
 * checked from both sides: the app changes composition there — bottom bar to
 * sidebar, stacked to two-column — and a layout that breaks does it at the
 * switch rather than in the middle of a range. 2560 is the other end nobody
 * looks at, where a capped column can leave a screen looking abandoned.
 */
const WIDTHS = [
  { name: "320", width: 320, height: 720 },
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1023", width: 1023, height: 900 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "2560", width: 2560, height: 1440 },
];

const ROUTES = [
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

/** Screens reached without a session. */
const PUBLIC_ROUTES = ["/signin", "/signup", "/offline", "/legal/privacy", "/legal/support"];

const findings = [];

function report(route, width, theme, kind, detail) {
  findings.push({ route, width, theme, kind, detail });
}

async function signIn(page) {
  await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username or email").fill(USER);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/home", { timeout: 60_000 });
}

/**
 * Everything a person could tap, with the box they would actually be aiming at.
 *
 * Three things make the box bigger than the element: a `::after` overlay that
 * carries the hit area past the ink (`.tap-44`, and the small button), a label
 * wrapping a checkbox, and an inline link inside a sentence — which WCAG 2.5.8
 * exempts, because a link in prose cannot be 44px tall without breaking the
 * paragraph it lives in.
 */
function smallTargets() {
  const selector =
    'a[href], button, input:not([type=hidden]), select, textarea, [role="switch"], [role="radio"], [role="tab"]';
  const out = [];

  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;

    let height = rect.height;
    let width = rect.width;

    const after = getComputedStyle(el, "::after");
    if (after && after.content !== "none" && after.position === "absolute") {
      const afterHeight = parseFloat(after.height);
      if (Number.isFinite(afterHeight)) height = Math.max(height, afterHeight);
      const afterWidth = parseFloat(after.width);
      if (Number.isFinite(afterWidth)) width = Math.max(width, afterWidth);
    }

    // A checkbox inside its own label: the label is the target.
    const label = el.closest("label");
    if (label && (el.tagName === "INPUT" || el.tagName === "SELECT")) {
      const labelRect = label.getBoundingClientRect();
      height = Math.max(height, labelRect.height);
      width = Math.max(width, labelRect.width);
    }

    // An inline link inside a sentence — the WCAG 2.5.8 exception.
    if (el.tagName === "A" && style.display.startsWith("inline")) {
      const parent = el.parentElement;
      const own = (el.textContent ?? "").trim().length;
      const around = (parent?.textContent ?? "").trim().length;
      if (parent && around > own + 6) continue;
    }

    if (height < 44 - 0.5 || width < 24) {
      out.push({
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
        tag: el.tagName.toLowerCase(),
        w: Math.round(width),
        h: Math.round(height),
      });
    }
  }

  return out;
}

async function auditPage(page, route, viewport, theme) {
  const consoleErrors = [];
  const failedRequests = [];

  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
  };
  const onResponse = (response) => {
    const status = response.status();
    const url = response.url();
    // A 401 on a public screen is the point of the screen, not a defect.
    if (status >= 400 && !url.includes("/_next/") && status !== 401) {
      failedRequests.push(`${status} ${url.replace(BASE, "")}`);
    }
  };

  page.on("console", onConsole);
  page.on("response", onResponse);

  const response = await page.goto(`${BASE}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(600);

  const status = response?.status() ?? 0;
  if (status >= 400) report(route, viewport.name, theme, "http", `${status} on navigation`);

  const landed = new URL(page.url()).pathname;
  // Two redirects are the product working: `/money` and `/dashboard` are
  // documented aliases (D-68), and an admin screen refuses a caller who is not
  // an admin of the home they currently have selected.
  const expectedRedirect =
    route.startsWith("/money") ||
    route === "/dashboard" ||
    route === "/analytics" ||
    (route.startsWith("/admin") && (landed === "/more" || landed === "/chores"));
  if (landed !== route && !expectedRedirect) {
    report(route, viewport.name, theme, "redirect", `landed on ${landed}`);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) report(route, viewport.name, theme, "overflow", `${overflow}px`);

  const headings = await page.locator("h1").count();
  if (headings === 0) report(route, viewport.name, theme, "heading", "no h1");
  if (headings > 1) report(route, viewport.name, theme, "heading", `${headings} h1 elements`);

  const noAlt = await page.evaluate(
    () => [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).length,
  );
  if (noAlt > 0) report(route, viewport.name, theme, "alt", `${noAlt} images without alt`);

  const small = await page.evaluate(smallTargets);
  if (small.length > 0) {
    const worst = small
      .slice(0, 4)
      .map((t) => `${t.tag} "${t.label}" ${t.w}x${t.h}`)
      .join("; ");
    report(
      route,
      viewport.name,
      theme,
      "target",
      `${small.length} under ${TOUCH_MIN}px — ${worst}`,
    );
  }

  if (viewport.width >= 1024) {
    const geometry = await page.evaluate(() => {
      const main = document.querySelector("main");
      const aside = document.querySelector("main aside");
      const inner = main?.firstElementChild;
      return {
        content: inner ? Math.round(inner.getBoundingClientRect().width) : null,
        aside: aside ? Math.round(aside.getBoundingClientRect().width) : null,
        asideSticky: aside ? getComputedStyle(aside).position : null,
      };
    });
    if (geometry.content && geometry.content > CONTENT_MAX + 8) {
      report(route, viewport.name, theme, "width", `content ${geometry.content}px > ${CONTENT_MAX}px`);
    }
    if (geometry.aside !== null && Math.abs(geometry.aside - RAIL) > 2) {
      report(route, viewport.name, theme, "rail", `rail ${geometry.aside}px, expected ${RAIL}px`);
    }
    if (geometry.aside !== null && geometry.asideSticky !== "sticky") {
      report(route, viewport.name, theme, "rail", `rail is ${geometry.asideSticky}, expected sticky`);
    }
  }

  for (const text of consoleErrors) report(route, viewport.name, theme, "console", text);
  for (const request of failedRequests) report(route, viewport.name, theme, "request", request);

  page.off("console", onConsole);
  page.off("response", onResponse);
}

const browser = await chromium.launch();

for (const theme of ["light", "dark"]) {
  for (const viewport of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: theme,
    });
    const page = await context.newPage();
    // The dev overlay sits over the tab bar's first destination at 360px.
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal{display:none !important}";
      document.addEventListener("DOMContentLoaded", () => document.head.append(style));
      if (document.head) document.head.append(style);
    });

    for (const route of PUBLIC_ROUTES) {
      await auditPage(page, route, viewport, theme);
    }

    await signIn(page);
    for (const route of ROUTES) {
      await auditPage(page, route, viewport, theme);
    }

    await context.close();
    process.stdout.write(`  swept ${theme} at ${viewport.name}px\n`);
  }
}

await browser.close();

const byKind = new Map();
for (const finding of findings) {
  byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
}

console.log(`\n${findings.length} findings\n`);
for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${kind}`);
}

console.log("");
const seen = new Set();
for (const finding of findings) {
  // One line per route+kind+detail: the same defect at three widths is one
  // defect, and printing it three times buries the others.
  const key = `${finding.route}|${finding.kind}|${finding.detail}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(
    `${finding.kind.padEnd(9)} ${finding.route.padEnd(24)} ${finding.width.padEnd(5)} ${finding.theme.padEnd(5)} ${finding.detail}`,
  );
}

process.exit(findings.length > 0 ? 1 : 0);
