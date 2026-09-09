import { expect, test } from "@playwright/test";

/**
 * The surface a person meets before they have an account, and the files nobody
 * ever looks at until they are wrong.
 *
 * Every case here was a real gap. `robots.txt` and `sitemap.xml` did not exist,
 * and once written they were still answered by the proxy with a redirect to
 * sign-in, so both were an HTML login page. There was no Open Graph image, so
 * every link to this product unfurled as nothing. The sign-up form's own button
 * sat below the fold on a 1366x768 laptop at Windows' default scaling. And the
 * 404 was unreachable in the one state where it matters.
 *
 * Nothing here needs a session, which is the point: this is what the internet
 * can see.
 */

test.describe.configure({ mode: "parallel" });

const PUBLIC_PAGES = [
  { path: "/signin", title: /Sign in · HouseOS/ },
  { path: "/signup", title: /Create your account · HouseOS/ },
  { path: "/legal/privacy", title: /Privacy · HouseOS/ },
  { path: "/legal/terms", title: /Terms · HouseOS/ },
  { path: "/legal/support", title: /Support · HouseOS/ },
];

test("robots.txt is a robots file, and it keeps crawlers out of the household", async ({
  request,
  baseURL,
}) => {
  const response = await request.get("/robots.txt");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");

  const body = await response.text();
  expect(body).toContain("Allow: /signin");
  expect(body).toContain("Allow: /legal/privacy");
  expect(body).toContain("Disallow: /");
  expect(body).toContain("Disallow: /api/");
  // The token is the secret. A link naming a real household has no business in
  // a search index.
  expect(body).toContain("Disallow: /join/");
  expect(body).toContain(`${baseURL}/sitemap.xml`);
});

test("sitemap.xml lists the five public pages and nothing else", async ({ request }) => {
  const response = await request.get("/sitemap.xml");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");

  const body = await response.text();
  for (const { path } of PUBLIC_PAGES) {
    expect(body, path).toContain(`${path}</loc>`);
  }
  expect(body).not.toContain("/join/");
  expect(body).not.toContain("/home<");
  expect((body.match(/<url>/g) ?? []).length).toBe(PUBLIC_PAGES.length);
});

test("a shared link unfurls into a real image", async ({ request }) => {
  const response = await request.get("/opengraph-image");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect((await response.body()).byteLength).toBeGreaterThan(10_000);
});

test("the browser has an icon to put in the tab, and the phone one to install", async ({
  request,
}) => {
  for (const path of ["/icon.png", "/apple-icon.png", "/icons/icon-512.png"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("image/png");
  }

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = await manifest.json();
  expect(body.icons.length).toBeGreaterThanOrEqual(3);
  expect(body.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(
    true,
  );
});

for (const { path, title } of PUBLIC_PAGES) {
  test(`${path} carries its own title, description and card`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveTitle(title);

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveCount(1);
    expect((await description.getAttribute("content"))?.length ?? 0).toBeGreaterThan(30);

    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  });
}

test("both ways in put their button above the fold on a scaled laptop", async ({ page }) => {
  // 1093x614 is a 1366x768 panel at Windows' default 125% display scaling.
  await page.setViewportSize({ width: 1093, height: 614 });

  for (const [path, name] of [
    ["/signin", /^Sign in$/],
    ["/signup", /^Create account$/],
  ] as const) {
    await page.goto(path);
    const cta = page.getByRole("button", { name }).first();
    await expect(cta).toBeVisible();
    const aboveFold = await cta.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    });
    expect(aboveFold, path).toBe(true);
  }
});

test("the cookie notice says what is stored, once, and goes away", async ({ page }) => {
  await page.goto("/signin");

  const notice = page.getByRole("region", { name: "About cookies" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("no tracking");
  await expect(notice.getByRole("link", { name: "What is stored" })).toHaveAttribute(
    "href",
    "/legal/privacy",
  );

  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toBeHidden();

  // Dismissed for good, not for this render.
  await page.goto("/legal/privacy");
  await expect(page.getByRole("region", { name: "About cookies" })).toHaveCount(0);
});

test("a wrong password is answered on the form, not swallowed", async ({ page }) => {
  await page.goto("/signin");

  await page.getByLabel("Username or email").fill("nobody-at-all-here");
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // `.first()` because Next's own route announcer is also role="alert" and is
  // permanently empty; the form's Alert is the one with words in it.
  await expect(
    page.getByRole("alert").filter({ hasText: /./ }).first(),
  ).toContainText(/do not match an account/i);
  // Still on the form, with what was typed still in it.
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByLabel("Username or email")).toHaveValue("nobody-at-all-here");
});

test("the Google button explains itself instead of failing", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/auth\/google/);
  await expect(
    page.getByRole("heading", { name: /Google sign-in is not ready yet/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create an account manually" }).click();
  await expect(page).toHaveURL(/\/signup/);
});

test("a mismatched confirmation stops the sign-up on the form", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Mismatch Case");
  await page.getByLabel("Username").fill("mismatchcase");
  await page.getByLabel("Email").fill("mismatchcase@example.com");
  await page.locator("#password").fill("test-password-1");
  await page.locator("#confirm_password").fill("test-password-2");
  await page.getByRole("button", { name: "Create account" }).click();
  // Blocked before any request: still on the form, told which field.
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByText("The two passwords do not match")).toBeVisible();
});

test("the terms page is reachable from every public shell", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { name: /terms HouseOS is offered on/i })).toBeVisible();

  // The legal shell has its own header nav; `.first()` because the document
  // bodies cross-link to each other as well.
  await page.getByRole("link", { name: "Privacy" }).first().click();
  await expect(page).toHaveURL(/\/legal\/privacy/);
});

/**
 * The Content-Security-Policy. Until 2026-09-06 the app sent
 * `frame-ancestors 'none'` and nothing else, which stops a click-jacking frame
 * and stops nothing else at all.
 *
 * These run on the public pages because a policy that is wrong is wrong before
 * anybody signs in, and because a violation shows up as a console message
 * rather than as a failed assertion anywhere else — a page whose scripts were
 * all refused still renders its HTML.
 */
test("every response carries a policy with a fresh nonce", async ({ request }) => {
  const first = await request.get("/signin");
  const second = await request.get("/signin");

  const policy = first.headers()["content-security-policy"];
  expect(policy, "the policy is enforced, not merely reported").toBeTruthy();
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
  // No blanket escape hatch for script: that is the whole point of the nonce.
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  const nonceOf = (value: string) => value.match(/'nonce-([^']+)'/)?.[1];
  const one = nonceOf(policy);
  const other = nonceOf(second.headers()["content-security-policy"]);
  expect(one).toBeTruthy();
  expect(one, "a nonce is per request or it is not a nonce").not.toBe(other);
});

test("a page loads with the policy on and refuses nothing it needs", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(text)) {
      violations.push(text);
    }
  });

  for (const { path } of PUBLIC_PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  expect(violations, violations.join("\n")).toEqual([]);
});

test("the theme script runs, which means it carried the nonce", async ({ page }) => {
  // The one script this app writes itself. Next stamps its own tags; it does
  // not stamp ours, so without the nonce threaded through the layout this
  // script is refused and every visit flashes the wrong theme before settling.
  await page.goto("/signin");
  await page.evaluate(() => localStorage.setItem("houseos-theme", "dark"));
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

/**
 * The health endpoint. An uptime checker has no session, so this is part of
 * the public surface whether or not anybody thinks of it that way — which is
 * also why what it answers matters more than that it answers.
 */
test("health answers an uptime checker, and tells it nothing else", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status(), "200 while the database is reachable").toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");

  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.database).toBe(true);
  expect(String(body.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // Anybody can call this. Nothing in the answer may describe the households
  // behind it — no counts, no names, no versions of anything but the deploy.
  expect(Object.keys(body).sort()).toEqual(["database", "revision", "status", "time"]);
});
