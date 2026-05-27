import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetOperatorRegistryForTests,
  _resetToolRegistryForTests,
} from "@kinetiks/tools";
import { runWorkflow, type DispatchDeps, type LedgerWrite } from "@kinetiks/runtime";
import type { WorkflowDispatchContext } from "@kinetiks/types";

// ============================================================
// Hoisted mocks for the four archivist run-* helpers
// ============================================================

type CleanFn = (admin: unknown, accountId: string) => Promise<unknown>;
type SweepFn = (admin: unknown, accountId: string) => Promise<unknown>;
type DeferredFn = (
  admin: unknown,
  accountId: string,
  deps: { patternsUrl: string; internalSecret: string },
) => Promise<unknown>;
type CalibrateFn = (admin: unknown, accountId: string, now: Date) => Promise<unknown>;

const {
  runArchivistCleanForAccount,
  runArchivistPatternSweepForAccount,
  runArchivistDeferredSweepForAccount,
  runArchivistCalibrateForAccount,
} = vi.hoisted(() => ({
  runArchivistCleanForAccount: vi.fn<CleanFn>(async (_admin, accountId) => ({
    account_id: accountId,
    dedup: [],
    normalize: [],
    gaps: { account_id: accountId, findings: [], proposals_created: 0 },
    quality: { account_id: accountId, layer_scores: {}, aggregate_quality: 1 },
  })),
  runArchivistPatternSweepForAccount: vi.fn<SweepFn>(async (_admin, accountId) => ({
    account_id: accountId,
    validated_to_declining: 2,
    declining_to_archived: 1,
    errors: [],
  })),
  runArchivistDeferredSweepForAccount: vi.fn<DeferredFn>(async () => ({
    scanned: 5,
    expired_count: 1,
    emitted_count: 1,
    failed_count: 0,
  })),
  runArchivistCalibrateForAccount: vi.fn<CalibrateFn>(async (_admin, accountId) => ({
    account_id: accountId,
    patterns_evaluated: 4,
    patterns_moved: 1,
    patterns_skipped: 2,
    patterns_raced: 0,
    errors: [],
  })),
}));

vi.mock("@/lib/archivist/run-clean", () => ({ runArchivistCleanForAccount }));
vi.mock("@/lib/archivist/run-pattern-sweep", () => ({
  runArchivistPatternSweepForAccount,
}));
vi.mock("@/lib/archivist/run-deferred-sweep", () => ({
  runArchivistDeferredSweepForAccount,
}));
vi.mock("@/lib/archivist/run-calibrate", () => ({
  runArchivistCalibrateForAccount,
}));

// The executor calls createAdminClient(); for the test we just need
// a placeholder so the call doesn't throw. The mocked helpers ignore
// the value they receive.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}) as unknown,
}));

// sweep_deferred reads serverEnv() for INTERNAL_SERVICE_SECRET and
// NEXT_PUBLIC_APP_URL — supply both so the step doesn't bail.
vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://test.kinetiks.ai",
    INTERNAL_SERVICE_SECRET: "test-secret",
  }),
}));

// Import AFTER mocks so the operator-boot pulls the mocked helpers.
import {
  bootOperatorRegistry,
  resolveKinetiksOperator,
  _resetOperatorBootForTests,
} from "../../operators/registry-boot";
import { archivistMaintenance } from "../archivist-maintenance";

// ============================================================
// Harness
// ============================================================

interface Harness {
  ledger: LedgerWrite[];
  deps: DispatchDeps;
}

function makeHarness(): Harness {
  const ledger: LedgerWrite[] = [];
  const deps: DispatchDeps = {
    resolveOperator: resolveKinetiksOperator,
    insertRoutingEvent: async () => {
      throw new Error("insertRoutingEvent must not be called for an internal-only workflow");
    },
    writeLedger: async (entry) => {
      ledger.push(entry);
    },
  };
  return { ledger, deps };
}

function makeCtx(accountIds: string[]): WorkflowDispatchContext {
  return {
    account_id: null,
    correlation_id: "corr_archivist_test",
    invoked_by: "cron:archivist-maintenance",
    team_scope_id: null,
    metadata: { account_ids: accountIds },
  };
}

beforeEach(() => {
  _resetOperatorRegistryForTests();
  _resetToolRegistryForTests();
  _resetOperatorBootForTests();
  bootOperatorRegistry();
  runArchivistCleanForAccount.mockClear();
  runArchivistPatternSweepForAccount.mockClear();
  runArchivistDeferredSweepForAccount.mockClear();
  runArchivistCalibrateForAccount.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// Tests
// ============================================================

describe("archivist-maintenance workflow", () => {
  it("dispatches the four steps in order, passing the same account batch into each", async () => {
    const harness = makeHarness();
    const accountIds = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ];

    // Pin time to a 00:00 UTC instant so calibrate's hour-gate fires.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));

    const summary = await runWorkflow(
      archivistMaintenance,
      makeCtx(accountIds),
      harness.deps,
    );

    vi.useRealTimers();

    expect(summary.ok).toBe(true);
    expect(summary.tasks.map((t) => t.task_key)).toEqual([
      "clean",
      "sweep",
      "sweep_deferred",
      "calibrate",
    ]);

    // Each helper was called once per account, twice total.
    expect(runArchivistCleanForAccount).toHaveBeenCalledTimes(2);
    expect(runArchivistPatternSweepForAccount).toHaveBeenCalledTimes(2);
    expect(runArchivistDeferredSweepForAccount).toHaveBeenCalledTimes(2);
    expect(runArchivistCalibrateForAccount).toHaveBeenCalledTimes(2);

    // Account IDs propagated correctly to each helper invocation.
    expect(runArchivistCleanForAccount.mock.calls.map((c) => c[1])).toEqual(accountIds);
    expect(runArchivistPatternSweepForAccount.mock.calls.map((c) => c[1])).toEqual(
      accountIds,
    );
    expect(runArchivistDeferredSweepForAccount.mock.calls.map((c) => c[1])).toEqual(
      accountIds,
    );
    expect(runArchivistCalibrateForAccount.mock.calls.map((c) => c[1])).toEqual(
      accountIds,
    );
  });

  it("writes a workflow_task_dispatched + workflow_task_completed pair per task; correlation_id threads through every entry", async () => {
    const harness = makeHarness();
    const accountIds = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"];

    // Don't force calibration hour; rely on the default which makes
    // the calibrate step skip on non-00:00 ticks. The Ledger pair
    // still fires because the operator returns `skipped: true` —
    // which counts as a successful run.
    const summary = await runWorkflow(
      archivistMaintenance,
      makeCtx(accountIds),
      harness.deps,
    );

    expect(summary.ok).toBe(true);

    const eventTypes = harness.ledger.map((e) => e.event_type);
    // 4 steps × 2 entries each = 8 entries, alternating.
    expect(eventTypes).toEqual([
      "workflow_task_dispatched",
      "workflow_task_completed",
      "workflow_task_dispatched",
      "workflow_task_completed",
      "workflow_task_dispatched",
      "workflow_task_completed",
      "workflow_task_dispatched",
      "workflow_task_completed",
    ]);

    // Every entry carries the same correlation_id and the workflow_key.
    for (const entry of harness.ledger) {
      expect(entry.detail["correlation_id"]).toBe("corr_archivist_test");
      expect(entry.detail["workflow_key"]).toBe("kinetiks_id.archivist_maintenance");
      expect(entry.source_operator).toBe("cron:archivist-maintenance");
    }
  });

  it("skips the calibrate step's actual work outside the 00:00 UTC tick and the workflow still succeeds", async () => {
    const harness = makeHarness();
    // Pin to a non-zero UTC hour so calibrate short-circuits.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T13:00:00Z"));

    const summary = await runWorkflow(
      archivistMaintenance,
      makeCtx(["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]),
      harness.deps,
    );

    vi.useRealTimers();

    expect(summary.ok).toBe(true);
    expect(runArchivistCalibrateForAccount).not.toHaveBeenCalled();
    const calibrateResult = summary.tasks.find((t) => t.task_key === "calibrate");
    expect(calibrateResult?.output).toMatchObject({ skipped: true });
  });
});
