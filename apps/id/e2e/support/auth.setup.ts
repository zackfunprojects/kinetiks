import { test as setup, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { adminClient, seedAccount } from "./db";

/**
 * Browser-lane auth: seed an account, sign it in through the real /login form
 * (so the @supabase/ssr session cookies are written by the app, not hand-rolled),
 * and persist storageState + the account context the collaborative spec needs.
 */

const AUTH_FILE = "e2e/.auth/user.json";
const ACCOUNT_FILE = "e2e/.auth/account.json";

setup("authenticate a seeded account", async ({ page }) => {
  const admin = adminClient();
  const account = await seedAccount(admin, "browser-collab");

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel(/password/i).fill(account.password);
  await page.getByRole("button", { name: /(log in|sign in)/i }).click();

  // Land anywhere inside the authenticated shell (middleware redirects on auth).
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
  writeFileSync(
    ACCOUNT_FILE,
    JSON.stringify({ accountId: account.accountId, userId: account.userId, email: account.email })
  );
});
