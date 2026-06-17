import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E for apps/id (Phase 8.8 — the program's E2E layer).
 *
 * Two lanes:
 *  - **api** (default, no browser): drives real HTTP against the booted app with
 *    seeded accounts + kntk_ API keys. Carries the safety-critical cross-account
 *    isolation specs — the must-never-break flow — at the HTTP boundary,
 *    complementing the pgTAP cross-tenant suites.
 *  - **chromium**: browser specs for the collaborative reference surface.
 *
 * App boot: `next start` (CI builds first) — build+start, never `next dev`, so the
 * real Node/Edge boundary is exercised (root Lesson 9). Points at the local
 * Supabase stack the rls-tests workflow uses (CLI 2.105.0).
 */

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Cross-account isolation specs share seeded accounts; keep workers serial so
  // one spec's fixture reset never races another. Fast enough (HTTP, no browser).
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    extraHTTPHeaders: { "Content-Type": "application/json" },
  },
  projects: [
    {
      name: "api",
      testMatch: /.*\.api\.spec\.ts/,
    },
    {
      // Seeds an account + signs it in through the real /login UI, persisting
      // storageState for the browser lane (so the @supabase/ssr cookies are
      // written by the app itself, format-agnostic).
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: /.*\.browser\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
  ],
  webServer: {
    // CI runs `next build` as a prior step; this starts the built app.
    command: process.env.E2E_WEBSERVER_CMD ?? "pnpm --filter @kinetiks/id start",
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      KINETIKS_FIXTURES_ENABLED: "true",
    },
  },
});
