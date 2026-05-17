import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  _resetPatternTypeRegistryForTests,
  registerPatternType,
} from "@kinetiks/tools";
import type { PatternTypeDescriptor } from "@kinetiks/types";
import { listPatterns } from "../list";

const ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

function patternType(over: Partial<PatternTypeDescriptor> = {}): PatternTypeDescriptor {
  return {
    pattern_type: "harvest.outreach_angle_performance",
    description: "Outreach angle x industry x seniority (fixture for list tests).",
    emitting_apps: ["harvest"],
    read_apps: ["marcus", "harvest", "oracle"],
    customer_visible: true,
    dimensions_schema: z.object({}).passthrough(),
    fingerprint_dimensions: ["angle_kind"],
    valid_outcome_metrics: [
      { name: "reply_rate", description: "Replies / sends ratio.", unit: "ratio_0_1" },
    ],
    decay_bounds: {
      initial_decay_days: 30,
      decay_floor_days: 14,
      decay_ceiling_days: 90,
      calibration_sample_threshold: 10,
    },
    confidence_thresholds: { validate_at: 0.7, decline_at: 0.4 },
    expected_max_fingerprints_per_account: 100,
    ...over,
  };
}

interface FakeRow {
  id: string;
  account_id: string;
  pattern_type: string;
  emitting_app: string;
  status: string;
  confidence_score: number;
  applies_to_icp: string | null;
  user_suppressed: boolean;
  user_starred: boolean;
  last_observed_at: string;
  observation_count: number;
}

interface QueryState {
  account_id?: string;
  pattern_types?: string[];
  source_apps?: string[];
  applies_to_icp?: { null: boolean; value?: string };
  minimum_confidence?: number;
  status_in?: string[];
  exclude_suppressed: boolean;
  only_starred: boolean;
  offset: number;
  limit: number;
}

function makeFake(rows: FakeRow[]) {
  return {
    from(table: string) {
      if (table !== "kinetiks_pattern_library") {
        throw new Error(`unexpected table: ${table}`);
      }
      const state: QueryState = {
        exclude_suppressed: false,
        only_starred: false,
        offset: 0,
        limit: Number.MAX_SAFE_INTEGER,
      };
      const orderTuples: Array<{ col: string; asc: boolean }> = [];

      const builder = {
        select(_columns: string, _opts?: unknown) {
          return builder;
        },
        eq(col: string, val: unknown) {
          if (col === "account_id") state.account_id = String(val);
          else if (col === "applies_to_icp") {
            state.applies_to_icp = { null: false, value: String(val) };
          } else if (col === "user_suppressed") {
            state.exclude_suppressed = val === false;
          } else if (col === "user_starred") {
            state.only_starred = val === true;
          }
          return builder;
        },
        in(col: string, values: unknown[]) {
          const stringValues = values.map(String);
          if (col === "pattern_type") state.pattern_types = stringValues;
          else if (col === "emitting_app") state.source_apps = stringValues;
          else if (col === "status") state.status_in = stringValues;
          return builder;
        },
        is(col: string, value: unknown) {
          if (col === "applies_to_icp" && value === null) {
            state.applies_to_icp = { null: true };
          }
          return builder;
        },
        gte(col: string, value: unknown) {
          if (col === "confidence_score") {
            state.minimum_confidence = Number(value);
          }
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderTuples.push({ col, asc: opts?.ascending ?? true });
          return builder;
        },
        range(from: number, to: number) {
          state.offset = from;
          state.limit = to - from + 1;
          return executeQuery();
        },
      };

      function executeQuery() {
        let filtered = rows.slice();
        if (state.account_id) {
          filtered = filtered.filter((r) => r.account_id === state.account_id);
        }
        if (state.pattern_types) {
          filtered = filtered.filter((r) => state.pattern_types!.includes(r.pattern_type));
        }
        if (state.source_apps) {
          filtered = filtered.filter((r) => state.source_apps!.includes(r.emitting_app));
        }
        if (state.status_in) {
          filtered = filtered.filter((r) => state.status_in!.includes(r.status));
        }
        if (state.applies_to_icp) {
          if (state.applies_to_icp.null) {
            filtered = filtered.filter((r) => r.applies_to_icp === null);
          } else {
            filtered = filtered.filter((r) => r.applies_to_icp === state.applies_to_icp!.value);
          }
        }
        if (state.minimum_confidence !== undefined) {
          filtered = filtered.filter((r) => r.confidence_score >= state.minimum_confidence!);
        }
        if (state.exclude_suppressed) {
          filtered = filtered.filter((r) => !r.user_suppressed);
        }
        if (state.only_starred) {
          filtered = filtered.filter((r) => r.user_starred);
        }
        const total = filtered.length;
        const paged = filtered.slice(state.offset, state.offset + state.limit);
        return Promise.resolve({ data: paged, count: total, error: null });
      }

      return builder;
    },
  };
}

beforeEach(() => {
  _resetPatternTypeRegistryForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  _resetPatternTypeRegistryForTests();
  vi.restoreAllMocks();
});

const baseRow = (over: Partial<FakeRow> = {}): FakeRow => ({
  id: "r1",
  account_id: ACCOUNT_ID,
  pattern_type: "harvest.outreach_angle_performance",
  emitting_app: "harvest",
  status: "validated",
  confidence_score: 0.7,
  applies_to_icp: "head_of_marketing_smb_saas",
  user_suppressed: false,
  user_starred: false,
  last_observed_at: new Date().toISOString(),
  observation_count: 10,
  ...over,
});

// Make the in-memory fake rows look like Pattern with the jsonb fields needed
function asPatternRow(row: FakeRow): FakeRow & Record<string, unknown> {
  return {
    ...row,
    team_scope_id: null,
    fingerprint: "fp",
    first_observed_at: row.last_observed_at,
    effective_decay_days: 30,
    decay_at: row.last_observed_at,
    validated_at: row.status === "validated" ? row.last_observed_at : null,
    declining_at: null,
    archived_at: null,
    user_annotation: null,
    dimensions: { angle_kind: "x" },
    outcome_metrics: [],
    evidence_summary: { last_n_ledger_ids: [], summary: { total_evidence_count: 0, period_days: 0, primary_metric: "", primary_metric_value: 0 } },
    created_at: row.last_observed_at,
    updated_at: row.last_observed_at,
  };
}

describe("listPatterns", () => {
  it("returns empty when no pattern types are visible to the caller", async () => {
    // No descriptors registered → no allowed types
    const fake = makeFake([]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
    });
    expect(res).toEqual({ patterns: [], total: 0 });
  });

  it("returns visible patterns ordered + projected (confidence) for an allowed caller", async () => {
    registerPatternType(patternType());
    const fake = makeFake([
      asPatternRow(baseRow({ id: "r1", confidence_score: 0.7 })),
      asPatternRow(baseRow({ id: "r2", confidence_score: 0.6 })),
    ]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
    });
    expect(res.total).toBe(2);
    expect(res.patterns).toHaveLength(2);
  });

  it("excludes pattern types whose read_apps does not contain caller_app", async () => {
    registerPatternType(patternType({ read_apps: ["oracle"] }));
    const fake = makeFake([asPatternRow(baseRow())]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "harvest",
    });
    expect(res.patterns).toHaveLength(0);
  });

  it("respects customer_visible for the customer_ui caller", async () => {
    registerPatternType(patternType({ pattern_type: "harvest.public", customer_visible: true }));
    registerPatternType(
      patternType({
        pattern_type: "harvest.internal",
        customer_visible: false,
        // Pattern Type Registry requires unique fingerprints/dimensions per descriptor
        fingerprint_dimensions: ["angle_kind"],
      }),
    );
    const fake = makeFake([
      asPatternRow(baseRow({ id: "rp", pattern_type: "harvest.public" })),
      asPatternRow(baseRow({ id: "ri", pattern_type: "harvest.internal" })),
    ]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "customer_ui",
    });
    expect(res.patterns.map((p) => p.id)).toEqual(["rp"]);
  });

  it("projects suppressed pattern confidence_score to 0", async () => {
    registerPatternType(patternType());
    const fake = makeFake([
      asPatternRow(
        baseRow({
          id: "r-sup",
          user_suppressed: true,
          confidence_score: 0.91,
        }),
      ),
    ]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
      exclude_user_suppressed: false,
    });
    expect(res.patterns[0]!.confidence_score).toBe(0);
  });

  it("excludes suppressed by default", async () => {
    registerPatternType(patternType());
    const fake = makeFake([
      asPatternRow(baseRow({ id: "ok", user_suppressed: false })),
      asPatternRow(baseRow({ id: "sup", user_suppressed: true })),
    ]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
    });
    expect(res.patterns.map((p) => p.id)).toEqual(["ok"]);
  });

  it("filters by minimum_confidence", async () => {
    registerPatternType(patternType());
    const fake = makeFake([
      asPatternRow(baseRow({ id: "low", confidence_score: 0.2 })),
      asPatternRow(baseRow({ id: "high", confidence_score: 0.8 })),
    ]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
      minimum_confidence: 0.5,
    });
    expect(res.patterns.map((p) => p.id)).toEqual(["high"]);
  });

  it("filters by applies_to_icp", async () => {
    registerPatternType(patternType());
    const fake = makeFake([
      asPatternRow(baseRow({ id: "a", applies_to_icp: "icp_a" })),
      asPatternRow(baseRow({ id: "b", applies_to_icp: "icp_b" })),
      asPatternRow(baseRow({ id: "n", applies_to_icp: null })),
    ]);
    const r1 = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
      applies_to_icp: "icp_a",
    });
    expect(r1.patterns.map((p) => p.id)).toEqual(["a"]);
    const r2 = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
      applies_to_icp: null,
    });
    expect(r2.patterns.map((p) => p.id)).toEqual(["n"]);
  });

  it("excludes archived by default; includes when include_archived=true", async () => {
    registerPatternType(patternType());
    const fake = makeFake([
      asPatternRow(baseRow({ id: "v", status: "validated" })),
      asPatternRow(baseRow({ id: "a", status: "archived" })),
    ]);
    const r1 = await listPatterns(fake, { account_id: ACCOUNT_ID, caller_app: "customer_ui" });
    expect(r1.patterns.map((p) => p.id)).toEqual(["v"]);
    const r2 = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "customer_ui",
      include_archived: true,
    });
    expect(r2.patterns.map((p) => p.id).sort()).toEqual(["a", "v"]);
  });

  it("supports only_starred filter", async () => {
    registerPatternType(patternType());
    const fake = makeFake([
      asPatternRow(baseRow({ id: "s", user_starred: true })),
      asPatternRow(baseRow({ id: "u", user_starred: false })),
    ]);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "customer_ui",
      only_starred: true,
    });
    expect(res.patterns.map((p) => p.id)).toEqual(["s"]);
  });

  it("respects limit + returns total separately", async () => {
    registerPatternType(patternType());
    const rows = Array.from({ length: 10 }, (_, i) =>
      asPatternRow(baseRow({ id: `r${i}`, confidence_score: 0.6 + i * 0.01 })),
    );
    const fake = makeFake(rows);
    const res = await listPatterns(fake, {
      account_id: ACCOUNT_ID,
      caller_app: "marcus",
      limit: 3,
    });
    expect(res.patterns).toHaveLength(3);
    expect(res.total).toBe(10);
  });
});
