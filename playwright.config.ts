import { defineConfig, devices } from "@playwright/test";

/**
 * The critical journeys only (docs/02-TRD.md section 9). Phase 1 covers J1:
 * sign up, create a house, approve a member.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  reporter: "list",
  /**
   * The suite runs against `next dev`, which compiles a route the first time a
   * test asks for it. A journey that walks six destinations in one case pays
   * six of those compiles inside a single timeout, and Playwright's 30 s
   * default is not enough for that on a cold cache — the failure looks like a
   * broken link and is nothing of the kind.
   */
  timeout: 60_000,
  /**
   * One retry locally, two on CI. Not to paper over product defects — every
   * assertion here is deterministic — but because the suite runs against
   * `next dev`, whose on-demand compilation occasionally leaves a chunk request
   * stalled behind an aborted stream. A journey that dies for that reason is
   * telling us about the dev server, and a second attempt separates the two.
   */
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
