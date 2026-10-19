import { defineConfig, devices } from "@playwright/test";

// Runs against the dev servers (web :3000, API :4000). Each run signs up its own
// throwaway tenant in global setup, so it never touches real accounts.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: true,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } }],
});
