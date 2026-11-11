import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests for the main flows, run against the dev server in a phone-sized Chromium.
 * `npm run e2e` (first time: `npx playwright install chromium`).
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
