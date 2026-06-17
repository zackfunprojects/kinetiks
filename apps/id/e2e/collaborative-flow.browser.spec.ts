import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The collaborative flow on the reference surface (program DoD): the embed
 * surface loads inside an authenticated session and the user walks the
 * collaborative interactions — presence, annotations, tempo control, in-panel
 * approval. Uses the storageState + account context the `setup` project produced.
 *
 * Browser lane: non-required (per the e2e plan, the browser lane stabilizes
 * before it gates). The API lane carries the must-never-break isolation flow.
 */

const { accountId } = JSON.parse(readFileSync("e2e/.auth/account.json", "utf8")) as {
  accountId: string;
};
const THREAD = "e2e-browser-thread";

test.beforeEach(async ({ page }) => {
  await page.goto(
    `/embed?mode=collaborative&account=${accountId}&app=harvest&thread=${THREAD}`
  );
});

test("the reference collaborative surface renders, fixture-labeled", async ({ page }) => {
  await expect(page.getByText("Sequence", { exact: false }).first()).toBeVisible();
  // Fixtures-honesty contract: the surface is tagged as fixture data.
  await expect(page.getByText(/fixture/i).first()).toBeVisible();
});

test("the tempo control is present and switchable (§7.1)", async ({ page }) => {
  const tempo = page.getByRole("group", { name: /collaboration tempo/i });
  await expect(tempo).toBeVisible();
  await tempo.getByRole("button", { name: /pair/i }).click();
  await expect(tempo.getByRole("button", { name: /pair/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("inline annotations appear on the surface (§6)", async ({ page }) => {
  // The reference agent seeds fixture annotations shortly after mount; one of
  // them references the ICP match count.
  await expect(page.getByText(/34 prospects match this ICP/i)).toBeVisible({ timeout: 10_000 });
});

test("closing the panel mid-task warns before leaving (§16.3)", async ({ page }) => {
  await page.getByRole("button", { name: /close panel/i }).click();
  // The thread-switch warning is a floating alert with Stay / Leave.
  await expect(page.getByText(/still working|leave anyway/i)).toBeVisible();
});

test("the panel reaches interactive within the §14.2 budget (<2s)", async ({ page }) => {
  // beforeEach already navigated; measure a fresh activation against the budget.
  const start = Date.now();
  await page.goto(
    `/embed?mode=collaborative&account=${accountId}&app=harvest&thread=${THREAD}`
  );
  await page.getByText("Sequence", { exact: false }).first().waitFor({ state: "visible" });
  expect(Date.now() - start).toBeLessThan(2000);
});
