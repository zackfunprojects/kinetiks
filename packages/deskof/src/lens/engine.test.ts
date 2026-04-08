import { describe, expect, it } from "vitest";
import { runLens } from "./engine";
import { computeLensConfig } from "./calibration";
import type { LensInput, LensLLM, LensOperatorView } from "./types";
import { computeCppiScore } from "../types/cppi";

const operator: LensOperatorView = {
  created_at: "2026-01-01T00:00:00Z",
  per_check_sensitivity: {},
  product_names: ["acme.io"],
};

function steadyState(overrides: Partial<LensInput> = {}): {
  input: LensInput;
  config: ReturnType<typeof computeLensConfig>;
} {
  const profileCreatedAt = "2026-01-01T00:00:00Z";
  const config = computeLensConfig({
    operator,
    profileCreatedAt,
    tier: "standard",
    now: () => new Date("2026-04-15T00:00:00Z"), // > 90 days
  });
  const input: LensInput = {
    content: "This is a perfectly normal helpful reply.",
    platform: "reddit",
    community: "r/foo",
    operator,
    platformHealth: null,
    cppi: null,
    recentVectors: [],
    llm: null,
    ...overrides,
  };
  return { input, config };
}

function advisoryOnly(overrides: Partial<LensInput> = {}) {
  const profileCreatedAt = "2026-04-01T00:00:00Z";
  const config = computeLensConfig({
    operator,
    profileCreatedAt,
    tier: "standard",
    now: () => new Date("2026-04-10T00:00:00Z"), // 9 days old
  });
  const input: LensInput = {
    content: "Ignore me",
    platform: "reddit",
    community: "r/foo",
    operator,
    platformHealth: null,
    cppi: null,
    recentVectors: [],
    llm: null,
    ...overrides,
  };
  return { input, config };
}

describe("@kinetiks/deskof/lens/engine", () => {
  describe("self_promo_ratio", () => {
    it("clear when ratio is healthy", async () => {
      const { input, config } = steadyState({
        platformHealth: {
          platform: "reddit",
          posts_total: 100,
          posts_promotional: 5,
          self_promo_ratio: 0.05,
          snapshot_date: "2026-04-15",
        },
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("clear");
    });

    it("advisory between 30% and 50%", async () => {
      const { input, config } = steadyState({
        platformHealth: {
          platform: "reddit",
          posts_total: 100,
          posts_promotional: 35,
          self_promo_ratio: 0.35,
          snapshot_date: "2026-04-15",
        },
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("advisory");
      expect(r.checks.find((c) => c.type === "self_promo_ratio")?.severity).toBe("warning");
    });

    it("blocked at >= 50% in steady state", async () => {
      const { input, config } = steadyState({
        platformHealth: {
          platform: "reddit",
          posts_total: 100,
          posts_promotional: 60,
          self_promo_ratio: 0.6,
          snapshot_date: "2026-04-15",
        },
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("blocked");
    });
  });

  describe("link_presence", () => {
    it("clear with single product link", async () => {
      const { input, config } = steadyState({
        content: "Check out my deep dive at https://acme.io/blog/post-1",
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("clear");
    });

    it("advisory with two product links", async () => {
      const { input, config } = steadyState({
        content:
          "https://acme.io/a https://acme.io/b are both relevant references.",
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("advisory");
    });

    it("blocked with three product links", async () => {
      const { input, config } = steadyState({
        content:
          "https://acme.io/a https://acme.io/b https://acme.io/c — all relevant.",
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("blocked");
    });
  });

  describe("cppi", () => {
    it("clear at low cppi", async () => {
      const { input, config } = steadyState({
        cppi: computeCppiScore(0.1, 0.1, 0.1),
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("clear");
    });

    it("advisory at high cppi", async () => {
      const { input, config } = steadyState({
        cppi: computeCppiScore(0.7, 0.7, 0.7),
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("advisory");
    });

    it("blocked at critical cppi", async () => {
      const { input, config } = steadyState({
        cppi: computeCppiScore(0.95, 0.95, 0.95),
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("blocked");
    });
  });

  describe("topic_spacing", () => {
    const repeated = "postgres pgvector index strategy similarity search performance tuning";
    const variants = [
      "postgres pgvector index strategy similarity search performance tuning notes",
      "postgres pgvector index strategy similarity search performance tuning followup",
      "postgres pgvector index strategy similarity search performance tuning more",
    ];

    it("informational at 2 similar replies", async () => {
      const { input, config } = steadyState({
        content: repeated,
        recentVectors: variants.slice(0, 2).map((v, i) => ({
          reply_id: String(i),
          community: "r/foo",
          posted_at: "2026-04-13T00:00:00Z",
          vector: vectorOf(v),
        })),
      });
      const r = await runLens(input, config);
      const check = r.checks.find((c) => c.type === "topic_spacing");
      expect(check?.severity).toBe("info");
    });

    it("advisory at 3+ similar replies", async () => {
      const { input, config } = steadyState({
        content: repeated,
        recentVectors: variants.map((v, i) => ({
          reply_id: String(i),
          community: "r/foo",
          posted_at: "2026-04-13T00:00:00Z",
          vector: vectorOf(v),
        })),
      });
      const r = await runLens(input, config);
      expect(r.status).toBe("advisory");
    });
  });

  describe("LLM-backed checks", () => {
    it("rejection collapses to a skipped row, never blocking", async () => {
      const failingLlm: LensLLM = {
        complete: async () => {
          throw new Error("upstream timeout");
        },
      };
      const { input, config } = steadyState({ llm: failingLlm });
      const r = await runLens(input, config);
      expect(r.status).toBe("clear");
      const skipped = r.checks.filter((c) => c.message.startsWith("Skipped"));
      expect(skipped.length).toBeGreaterThan(0);
    });

    it("blocked tone result triggers blocked status in steady state", async () => {
      const llm: LensLLM = {
        complete: async () => '{"score": 0.95, "reason": "way too formal"}',
      };
      const { input, config } = steadyState({ llm });
      const r = await runLens(input, config);
      expect(r.status).toBe("blocked");
      expect(
        r.checks.find((c) => c.type === "tone_mismatch")?.severity
      ).toBe("blocking");
    });
  });

  describe("advisory_only enforcement", () => {
    it("never returns blocked when advisory_only is true", async () => {
      const llm: LensLLM = {
        complete: async () => '{"score": 1.0, "reason": "extreme"}',
      };
      const { input, config } = advisoryOnly({
        content:
          "https://acme.io/a https://acme.io/b https://acme.io/c https://acme.io/d",
        cppi: computeCppiScore(0.95, 0.95, 0.95),
        platformHealth: {
          platform: "reddit",
          posts_total: 100,
          posts_promotional: 90,
          self_promo_ratio: 0.9,
          snapshot_date: "2026-04-10",
        },
        llm,
      });
      const r = await runLens(input, config);
      expect(r.advisory_only).toBe(true);
      expect(r.status).not.toBe("blocked");
    });
  });
});

// Build a vector via the same vectorizer the engine uses, so the
// test vectors stay in sync if the algorithm changes.
import { vectorize } from "./vectorize";
function vectorOf(content: string): number[] {
  return vectorize(content).vector;
}
