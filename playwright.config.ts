import { defineConfig, devices } from "@playwright/test";
import path from "path";

const AUTH_STATE = path.join(__dirname, "tests/e2e/.auth/state.json");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      // Public / unauthenticated flows — no session needed.
      name: "public",
      testIgnore: /authed\//,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Authenticated flows — reuse the seeded storageState.
      name: "authed",
      testMatch: /authed\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
    },
  ],
  // Auto-start the dev server in CI; reuse an already-running one locally.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
