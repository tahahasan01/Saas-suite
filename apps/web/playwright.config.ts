import { defineConfig, devices } from "@playwright/test";

// Runs against the dev servers (web :3000, API :4000). Each run signs up its own
// throwaway tenant in global setup, so it never touches real accounts.
//
// `npx playwright test` runs Chromium only. E2E_ALL_BROWSERS=1 adds:
//   webkit, firefox — the whole suite in Safari's and Firefox's engines
//   dark            — the whole suite in Chromium with the dark theme selected
//   large-data      — its own throwaway tenant seeded with a big catalog/staff list
//                     (e2e/seed-large.ts), running large-data.spec + responsive.spec
const ALL = process.env.E2E_ALL_BROWSERS === "1";
const desktop = { viewport: { width: 1366, height: 768 } };

export default defineConfig({
  testDir: "./e2e",
  // large-data.spec needs the seeded tenant, so only its own project runs it.
  testIgnore: [/large-data\.spec\.ts/],
  timeout: 45_000,
  fullyParallel: true,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    ...(ALL
      ? [
          { name: "webkit", use: { ...devices["Desktop Safari"], ...desktop } },
          { name: "firefox", use: { ...devices["Desktop Firefox"], ...desktop } },
          // The app's theme is a stored choice (localStorage "theme"), not the OS
          // preference, so the dark project seeds that choice into storage state.
          { name: "dark-setup", testMatch: /dark\.setup\.ts/, testIgnore: [] },
          {
            name: "dark",
            dependencies: ["dark-setup"],
            use: { ...devices["Desktop Chrome"], ...desktop, colorScheme: "dark" as const, storageState: "e2e/.auth/state-dark.json" },
          },
          { name: "large-data-setup", testMatch: /seed-large\.ts/, testIgnore: [], timeout: 300_000 },
          {
            name: "large-data",
            dependencies: ["large-data-setup"],
            testMatch: [/large-data\.spec\.ts/, /responsive\.spec\.ts/],
            testIgnore: [],
            use: { ...devices["Desktop Chrome"], ...desktop, storageState: "e2e/.auth/large.json" },
          },
        ]
      : []),
  ],
});
