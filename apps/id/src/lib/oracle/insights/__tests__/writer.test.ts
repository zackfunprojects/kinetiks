/**
 * Tests for the insight writer's PII guard + shape validation.
 *
 * The DB-side integration (actual insert + dedup) is exercised in the
 * runner integration test. Here we lock down:
 *   - Forbidden PII-shaped keys throw via Zod
 *   - Valid signals build the correct insert row
 *   - Empty input is a no-op
 */

import { describe, expect, it, vi } from "vitest";

import { writeInsights } from "../writer";
import type { OracleSignal } from "../types";

function makeSignal(overrides: Partial<OracleSignal> = {}): OracleSignal {
  return {
    type: "anomaly",
    severity: "notable",
    source_app: "ga4",
    source_operator: "oracle.analyzer.anomaly",
    summary: "ga4_sessions z=3.2",
    evidence: { metric_key: "ga4_sessions", z_score: 3.2 },
    suggested_action: { kind: "open_thread", label: "Investigate" },
    dedup_key: "anomaly:ga4_sessions::above:2026-W20",
    ...overrides,
  } as OracleSignal;
}

function fakeAdmin() {
  const insertImpl = vi.fn().mockResolvedValue({ count: 1, error: null });
  return {
    admin: {
      from: vi.fn().mockReturnValue({ insert: insertImpl }),
    },
    insertImpl,
  };
}

describe("writeInsights", () => {
  it("returns {written:0, rejected:[]} on empty input without touching the DB", async () => {
    const { admin, insertImpl } = fakeAdmin();
    const out = await writeInsights(admin as never, { accountId: "acct", signals: [] });
    expect(out).toEqual({ written: 0, rejected: [] });
    expect(insertImpl).not.toHaveBeenCalled();
  });

  it("rejects signals carrying forbidden PII-shaped keys", async () => {
    const { admin, insertImpl } = fakeAdmin();
    const bad = makeSignal({
      // String values are TS-valid; the writer enforces the PII guard at runtime via Zod.
      evidence: { contact_email: "user@example.com", metric_key: "x" },
    });
    const out = await writeInsights(admin as never, { accountId: "acct", signals: [bad] });
    expect(out.written).toBe(0);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]!.reason).toContain("PII");
    expect(insertImpl).not.toHaveBeenCalled();
  });

  it("rejects token_* / auth_* / password / ssn / dob keys", async () => {
    const { admin } = fakeAdmin();
    for (const key of ["token_id", "auth_secret", "password", "ssn", "dob"]) {
      const sig = makeSignal({
        evidence: { [key]: "x", metric_key: "y" },
      });
      const out = await writeInsights(admin as never, { accountId: "acct", signals: [sig] });
      expect(out.rejected.length, key).toBe(1);
    }
  });

  it("stamps source_operator to 'oracle.analyzer' regardless of input sub-operator", async () => {
    const { admin, insertImpl } = fakeAdmin();
    await writeInsights(admin as never, {
      accountId: "acct",
      signals: [makeSignal({ source_operator: "oracle.analyzer.drill" })],
    });
    const row = insertImpl.mock.calls[0]![0][0];
    expect(row.source_operator).toBe("oracle.analyzer");
  });

  it("forces team_scope_id to null", async () => {
    const { admin, insertImpl } = fakeAdmin();
    await writeInsights(admin as never, { accountId: "acct", signals: [makeSignal()] });
    const row = insertImpl.mock.calls[0]![0][0];
    expect(row.team_scope_id).toBeNull();
  });

  it("rejects values that aren't number|string|boolean|string[]", async () => {
    const { admin } = fakeAdmin();
    const bad = makeSignal({
      // @ts-expect-error — nested objects forbidden
      evidence: { metric_key: { nested: "object" } },
    });
    const out = await writeInsights(admin as never, { accountId: "acct", signals: [bad] });
    expect(out.rejected.length).toBe(1);
  });

  it("accepts the canonical detector evidence shape", async () => {
    const { admin, insertImpl } = fakeAdmin();
    const out = await writeInsights(admin as never, {
      accountId: "acct",
      signals: [
        makeSignal({
          evidence: {
            metric_key: "ga4_sessions",
            dimension: "device",
            dim_value: "mobile",
            share: 0.62,
            dim_delta_pct: -0.31,
            overall_delta_pct: 0.04,
            period: "last_28_days",
          },
        }),
      ],
    });
    expect(out.written).toBe(1);
    expect(insertImpl).toHaveBeenCalledOnce();
  });
});
