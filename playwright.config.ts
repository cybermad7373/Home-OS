import { defineConfig, devices } from "@playwright/test";

/**
 * The critical journeys only (docs/02-TRD.md section 9). Phase 1 covers J1:
 * sign up, create a house, approve a member.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  reporter: "list",
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
