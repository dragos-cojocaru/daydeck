import { defineConfig, devices } from "@playwright/test";

// Runs against PLAYWRIGHT_BASE_URL when set (a Vercel preview in CI),
// otherwise against a local production build on port 3100.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Against the mock Buffer server, the desktop and phone runs share its accounts, counters and
  // one database, so they take turns. Without the mock, tests run in parallel.
  workers: process.env.E2E_MOCK_BUFFER_URL ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // `next dev --experimental-https` serves a self-signed certificate.
    ignoreHTTPSErrors: baseURL.startsWith("https://localhost"),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm start --port 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
