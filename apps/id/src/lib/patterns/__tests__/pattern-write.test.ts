import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  Pattern,
  PatternEmissionPayload,
  PatternTypeDescriptor,
} from "@kinetiks/types";
import { _resetRegistryForTests } from "@kinetiks/lib/state-machines";
import { registerKinetiksStateMachines, _resetStateMachinesForTests } from "../../state-machines-init";
import {
  isFullyCoveredByExistingEvidence,
  mergeOutcomeStats,
  writePatternEmission,
  type PatternWriteDb,
} from "../pattern-write";

beforeEach(() => {
  _resetRegistryForTests();
  _resetStateMachinesForTests();
  registerKinetiksStateMachines();
});

afterEach(() => {
  _resetRegistryForTests();
  _resetStateMachinesForTests();
});

const ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

function descriptor(over: Partial<PatternTypeDescriptor> = {}): PatternTypeDescriptor {
  return {
    pattern_type: "harvest.outreach_angle_performance.reply_rate",
    source_app: "harvest",
    description:
      "Outreach angle x industry x seniority signature mapped to reply rate (fixture).",
    read_apps: ["marcus", "harvest"],
    customer_visible: true,
    dimensions_schema: z
      .object({
        angle_kind: z.string(),
        industry_bucket: z.string(),
        seniority_tier: z.string(),
      })
      .passthrough(),
    fingerprint_dimensions: ["angle_kind", "industry_bucket", "seniority_tier"],
    outcome_metric: "reply_rate",
    outcome_unit: "ratio_0_1",
    outcome_direction: "higher_is_better",
    decay_bounds: {
      initial_decay_days: 30,
      decay_floor_days: 14,
      decay_ceiling_days: 90,
      calibration_sample_threshold: 10,
    },
    confidence_thresholds: { validate_at: 0.7, decline_at: 0.4 },
    ...over,
  };
}

function payload(over: Partial<PatternEmissionPayload> = {}): PatternEmissionPayload {
  return {
    pattern_type: "harvest.outreach_angle_performance.reply_rate",
    dimensions: {
      angle_kind: "curiosity_hook",
      industry_bucket: "b2b_saas",
      seniority_tier: "director",
    },
    outcome_metric: "reply_rate",
    outcome_value: 0.14,
    outcome_direction: "higher_is_better",
    baseline_value: 0.1,
    sample_size: 50,
    variance: 0.001,
    applies_to_icp: "head_of_marketing_smb_saas",
    evidence_refs: ["ledger-1", "ledger-2"],
    ...over,
  };
}

function basePattern(over: Partial<Pattern> = {}): Pattern {
  return {
    id: "pat-1",
    account_id: ACCOUNT_ID,
    team_scope_id: null,
    source_app: "harvest",
    source_workflow_id: null,
    pattern_type: "harvest.outreach_angle_performance.reply_rate",
    applies_to_icp: "head_of_marketing_smb_saas",
    fingerprint: "fp-1",
    outcome_metric: "reply_rate",
    outcome_value: 0.12,
    outcome_direction: "higher_is_better",
    baseline_value: 0.1,
    lift_ratio: 1.2,
    sample_size: 100,
    observation_count: 4,
    confidence_score: 0.3,
    variance: 0.002,
    status: "emerging",
    first_observed_at: new Date("2026-01-01T00:00:00Z").toISOString(),
    last_observed_at: new Date("2026-01-10T00:00:00Z").toISOString(),
    effective_decay_days: 30,
    decay_at: new Date("2026-02-10T00:00:00Z").toISOString(),
    validated_at: null,
    declining_at: null,
    archived_at: null,
    imported: false,
    imported_from: null,
    user_starred: false,
    user_suppressed: false,
    user_annotation: null,
    dimensions: {
      angle_kind: "curiosity_hook",
      industry_bucket: "b2b_saas",
      seniority_tier: "director",
    },
    evidence_summary: {
      last_n_ledger_ids: ["ledger-prev-1", "ledger-prev-2"],
      summary: { total_evidence_count: 4, period_days: 9 },
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-10T00:00:00Z",
    ...over,
  };
}

interface FakeDbState {
  patterns: Map<string, Pattern>;
  ledger: Array<{ event_type: string; detail: Record<string, unknown> }>;
}

function createFakeDb(initial?: Pattern[]): {
  db: PatternWriteDb;
  state: FakeDbState;
} {
  const state: FakeDbState = { patterns: new Map(), ledger: [] };
  for (const p of initial ?? []) state.patterns.set(p.id, p);
  let nextId = 1000;
  const db: PatternWriteDb = {
    async findByFingerprint({ account_id, pattern_type, fingerprint }) {
      for (const p of state.patterns.values()) {
        if (
          p.account_id === account_id &&
          p.pattern_type === pattern_type &&
          p.fingerprint === fingerprint
        )
          return p;
      }
      return null;
    },
    async insertPattern(row) {
      const id = row.id ?? `gen-${nextId++}`;
      const inserted: Pattern = {
        ...row,
        id,
        created_at: row.first_observed_at,
        updated_at: row.first_observed_at,
      };
      state.patterns.set(id, inserted);
      return inserted;
    },
    async updatePatternEvidence(args) {
      const prev = state.patterns.get(args.id);
      if (!prev) throw new Error(`unknown pattern ${args.id}`);
      const next: Pattern = {
        ...prev,
        outcome_value: args.outcome_value,
        sample_size: args.sample_size,
        variance: args.variance,
        baseline_value: args.baseline_value,
        lift_ratio: args.lift_ratio,
        confidence_score: args.confidence_score,
        observation_count: args.observation_count,
        last_observed_at: args.last_observed_at,
        decay_at: args.decay_at,
        evidence_summary: args.evidence_summary,
        updated_at: args.last_observed_at,
      };
      state.patterns.set(args.id, next);
      return next;
    },
    async updatePatternStatus(args) {
      const prev = state.patterns.get(args.id);
      if (!prev) throw new Error(`unknown pattern ${args.id}`);
      const next: Pattern = {
        ...prev,
        status: args.status,
        ...(args.status === "validated" && !prev.validated_at
          ? { validated_at: new Date().toISOString() }
          : {}),
        ...(args.status === "declining" ? { declining_at: new Date().toISOString() } : {}),
        ...(args.status === "archived" ? { archived_at: new Date().toISOString() } : {}),
      };
      state.patterns.set(args.id, next);
      return next;
    },
    async insertLedgerEntry(args) {
      state.ledger.push({ event_type: args.event_type, detail: args.detail });
    },
  };
  return { db, state };
}

// ============================================================
// mergeOutcomeStats (Welford parallel-merge)
// ============================================================

describe("mergeOutcomeStats", () => {
  it("returns b when a is empty", () => {
    const r = mergeOutcomeStats(
      { mean: 0, variance: 0, count: 0 },
      { mean: 0.5, variance: 0.01, count: 100 },
    );
    expect(r).toEqual({ mean: 0.5, variance: 0.01, count: 100 });
  });

  it("returns a when b is empty", () => {
    const r = mergeOutcomeStats(
      { mean: 0.3, variance: 0.02, count: 50 },
      { mean: 0, variance: 0, count: 0 },
    );
    expect(r).toEqual({ mean: 0.3, variance: 0.02, count: 50 });
  });

  it("computes weighted mean for equal-sized batches", () => {
    const r = mergeOutcomeStats(
      { mean: 0.2, variance: 0.01, count: 100 },
      { mean: 0.4, variance: 0.01, count: 100 },
    );
    expect(r.mean).toBeCloseTo(0.3, 6);
    expect(r.count).toBe(200);
    expect(r.variance).toBeGreaterThan(0.01); // delta term adds variance
  });

  it("computes weighted mean for unequal-sized batches", () => {
    const r = mergeOutcomeStats(
      { mean: 0.2, variance: 0.01, count: 90 },
      { mean: 0.4, variance: 0.01, count: 10 },
    );
    // 0.2 * 0.9 + 0.4 * 0.1 = 0.22
    expect(r.mean).toBeCloseTo(0.22, 6);
    expect(r.count).toBe(100);
  });

  it("handles count == 1 (variance undefined inputs)", () => {
    const r = mergeOutcomeStats(
      { mean: 0.3, variance: 0, count: 1 },
      { mean: 0.5, variance: 0, count: 1 },
    );
    expect(r.mean).toBeCloseTo(0.4, 6);
    expect(r.count).toBe(2);
    // With both inputs count=1, M_a + M_b = 0 + 0; only the delta term
    // contributes, variance = delta^2 * 1*1/2 / (2-1) = (0.2)^2/2 = 0.02
    expect(r.variance).toBeCloseTo(0.02, 6);
  });
});

// ============================================================
// isFullyCoveredByExistingEvidence
// ============================================================

describe("isFullyCoveredByExistingEvidence", () => {
  it("returns false for empty payload refs", () => {
    expect(isFullyCoveredByExistingEvidence([], ["a", "b"])).toBe(false);
  });

  it("returns true when every payload ref is already known", () => {
    expect(isFullyCoveredByExistingEvidence(["a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("returns false when any payload ref is new", () => {
    expect(isFullyCoveredByExistingEvidence(["a", "new"], ["a", "b"])).toBe(false);
  });
});

// ============================================================
// writePatternEmission
// ============================================================

describe("writePatternEmission", () => {
  it("creates an emerging pattern when none exists", async () => {
    const { db, state } = createFakeDb();
    const result = await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor(),
        bucketized_dimensions: payload().dimensions,
        fingerprint: "fp-1",
        payload: payload(),
        now: new Date("2026-05-17T00:00:00Z"),
      },
      db,
    );
    expect(result.outcome).toBe("created_emerging");
    if (result.outcome === "created_emerging") {
      expect(result.status).toBe("emerging");
      expect(result.observation_count).toBe(2);
      expect(result.sample_size).toBe(50);
      expect(result.lift_ratio).toBeCloseTo(1.4, 4); // 0.14 / 0.1
    }
    expect(state.patterns.size).toBe(1);
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0]!.event_type).toBe("pattern_observed");
  });

  it("adds evidence to an existing pattern (merge path) without crossing thresholds", async () => {
    const existing = basePattern();
    const { db, state } = createFakeDb([existing]);
    const result = await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor({
          confidence_thresholds: { validate_at: 0.99, decline_at: 0.05 },
        }),
        bucketized_dimensions: payload().dimensions,
        fingerprint: existing.fingerprint,
        payload: payload({ evidence_refs: ["ledger-3", "ledger-4"] }),
        now: new Date("2026-05-17T00:00:00Z"),
      },
      db,
    );
    expect(result.outcome).toBe("evidence_added");
    const updated = state.patterns.get(existing.id)!;
    expect(updated.observation_count).toBe(6);
    expect(updated.sample_size).toBe(150); // 100 + 50
    expect(updated.evidence_summary.last_n_ledger_ids).toContain("ledger-3");
    expect(updated.evidence_summary.last_n_ledger_ids).toContain("ledger-4");
    expect(state.ledger).toHaveLength(1);
  });

  it("returns duplicate_ignored when every evidence ref is already covered", async () => {
    const existing = basePattern({
      evidence_summary: {
        last_n_ledger_ids: ["ledger-1", "ledger-2"],
        summary: { total_evidence_count: 4, period_days: 9 },
      },
    });
    const { db, state } = createFakeDb([existing]);
    const result = await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor(),
        bucketized_dimensions: payload().dimensions,
        fingerprint: existing.fingerprint,
        payload: payload({ evidence_refs: ["ledger-1", "ledger-2"] }),
      },
      db,
    );
    expect(result.outcome).toBe("duplicate_ignored");
    expect(state.ledger).toHaveLength(0);
    expect(state.patterns.get(existing.id)!.observation_count).toBe(4);
  });

  it("promotes emerging → validated when confidence crosses validate_at", async () => {
    const existing = basePattern({ observation_count: 30, sample_size: 1000 });
    const { db, state } = createFakeDb([existing]);
    const result = await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor({
          confidence_thresholds: { validate_at: 0.6, decline_at: 0.3 },
        }),
        bucketized_dimensions: payload().dimensions,
        fingerprint: existing.fingerprint,
        payload: payload({
          sample_size: 500,
          variance: 0.0005,
          evidence_refs: ["ledger-new-1", "ledger-new-2", "ledger-new-3"],
        }),
        now: new Date("2026-05-17T00:00:00Z"),
      },
      db,
    );
    expect(result.outcome).toBe("promoted");
    if (result.outcome === "promoted") {
      expect(result.status).toBe("validated");
      expect(result.transitioned_from).toBe("emerging");
      expect(result.sample_size).toBe(1500);
    }
    expect(state.patterns.get(existing.id)!.status).toBe("validated");
    expect(state.ledger.find((l) => l.event_type === "pattern_arbitrated")).toBeDefined();
  });

  it("demotes validated → declining when confidence falls below decline_at", async () => {
    const existing = basePattern({
      status: "validated",
      validated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
      confidence_score: 0.5,
      observation_count: 5,
      sample_size: 100,
      effective_decay_days: 10,
      last_observed_at: new Date("2026-04-30T00:00:00Z").toISOString(),
    });
    const { db, state } = createFakeDb([existing]);
    const result = await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor({
          decay_bounds: {
            initial_decay_days: 10,
            decay_floor_days: 5,
            decay_ceiling_days: 30,
            calibration_sample_threshold: 5,
          },
          confidence_thresholds: { validate_at: 0.95, decline_at: 0.9 },
        }),
        bucketized_dimensions: payload().dimensions,
        fingerprint: existing.fingerprint,
        payload: payload({
          sample_size: 1,
          variance: 0,
          evidence_refs: ["ledger-new-1"],
        }),
        now: new Date("2026-05-17T00:00:00Z"),
      },
      db,
    );
    expect(result.outcome).toBe("demoted");
    if (result.outcome === "demoted") {
      expect(result.status).toBe("declining");
      expect(result.transitioned_from).toBe("validated");
    }
    expect(state.patterns.get(existing.id)!.status).toBe("declining");
  });

  it("recomputes lift_ratio from merged outcome_value + baseline", async () => {
    const existing = basePattern({
      outcome_value: 0.1,
      baseline_value: 0.05,
      lift_ratio: 2.0,
      sample_size: 100,
    });
    const { db, state } = createFakeDb([existing]);
    await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor({
          confidence_thresholds: { validate_at: 0.99, decline_at: 0.05 },
        }),
        bucketized_dimensions: payload().dimensions,
        fingerprint: existing.fingerprint,
        payload: payload({
          outcome_value: 0.3,
          baseline_value: 0.05,
          sample_size: 100,
          evidence_refs: ["new-evidence-a"],
        }),
        now: new Date("2026-05-17T00:00:00Z"),
      },
      db,
    );
    const updated = state.patterns.get(existing.id)!;
    expect(updated.outcome_value).toBeCloseTo(0.2, 6); // mean of 0.1, 0.3 weighted equally
    expect(updated.lift_ratio).toBeCloseTo(0.2 / 0.05, 6); // 4.0
  });

  it("appends to evidence_summary cap with most-recent retained", async () => {
    const cap50ids = Array.from({ length: 50 }, (_, i) => `old-${i}`);
    const existing = basePattern({
      evidence_summary: {
        last_n_ledger_ids: cap50ids,
        summary: { total_evidence_count: 50, period_days: 30 },
      },
    });
    const { db, state } = createFakeDb([existing]);
    await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor(),
        bucketized_dimensions: payload().dimensions,
        fingerprint: existing.fingerprint,
        payload: payload({ evidence_refs: ["new-a", "new-b"] }),
      },
      db,
    );
    const updated = state.patterns.get(existing.id)!;
    expect(updated.evidence_summary.last_n_ledger_ids).toHaveLength(50);
    expect(updated.evidence_summary.last_n_ledger_ids.slice(-2)).toEqual(["new-a", "new-b"]);
    expect(updated.evidence_summary.last_n_ledger_ids).not.toContain("old-0");
  });

  it("writes Ledger entries with pattern_id attached on every state-changing path", async () => {
    const { db, state } = createFakeDb();
    const result = await writePatternEmission(
      {
        account_id: ACCOUNT_ID,
        source_app: "harvest",
        descriptor: descriptor(),
        bucketized_dimensions: payload().dimensions,
        fingerprint: "fp-1",
        payload: payload(),
      },
      db,
    );
    expect(result.outcome).toBe("created_emerging");
    expect(state.ledger[0]!.detail.pattern_id).toBeDefined();
    expect(state.ledger[0]!.detail.outcome).toBe("created_emerging");
  });
});
