import { readFileSync } from "node:fs";
import { adminClient, deleteAccount } from "./db";

/**
 * Deletes the browser-lane account the `setup` project seeded — but only after
 * ALL projects have run (a `setup.afterAll` would delete it before the chromium
 * project, which depends on setup, ever uses it). When only the api lane runs
 * (`--project=api`, the CI default), setup never produced account.json, so this
 * is a no-op.
 */
export default async function globalTeardown(): Promise<void> {
  let account: { accountId: string; userId: string };
  try {
    account = JSON.parse(readFileSync("e2e/.auth/account.json", "utf8"));
  } catch {
    return; // setup didn't run — nothing to clean up.
  }
  // Reuse the verified delete (error-checked + row-count-verified) rather than
  // reimplementing it, so a silent teardown failure can't contaminate later runs.
  await deleteAccount(adminClient(), account);
}
