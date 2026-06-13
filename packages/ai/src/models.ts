/**
 * Model roles + resolution — the use-case → model indirection.
 *
 * Tasks declare a ROLE (the stable use-case dimension), never a concrete
 * Claude model id. Anthropic rotates concrete ids and deprecates old
 * snapshots; hard-coding them scatters the dependency across the repo and
 * rots the moment a new model ships. `resolveModel(role)` maps a role to
 * the current model id, consulting an injected assignment reader
 * (DB-backed in apps/id) and falling back to the committed `SEED_MODELS`
 * pin when no reader is wired (tests, pre-boot) or the reader has nothing
 * for that role. This mirrors the `configureAICallLogger` seam: the
 * package declares the contract; the app provides the implementation.
 *
 * The resolver is intentionally SYNCHRONOUS — it sits on the hot path of
 * every router call. The DB-backed reader keeps an in-memory snapshot that
 * apps/id refreshes out of band (on boot, on a short interval, and when an
 * operator approves a model flip); the hot path never awaits a query.
 *
 * The live Anthropic Models API is the source of truth: a discovery cron
 * (apps/id) reconciles the active mapping against it and proposes flips
 * for operator approval. `SEED_MODELS` is only the known-good fallback.
 */

/** The stable use-case dimension. Compile-time safe; never changes. */
export type ModelRole = "fast" | "balanced" | "deep";

/** A concrete Anthropic model id. Dynamic (resolved at runtime), so a
 *  string rather than a closed union — roles carry the type safety. */
export type ModelId = string;

export const MODEL_ROLES: readonly ModelRole[] = ["fast", "balanced", "deep"] as const;

export type ModelFamily = "haiku" | "sonnet" | "opus";

/**
 * Which Anthropic family each role draws from. Used by the discovery
 * layer to pick the newest model per role, and by the operator-facing
 * proposal copy. The role→family relationship is stable; the
 * family→concrete-id binding is what discovery keeps current.
 *
 * Per CLAUDE.md: Haiku = lightweight pre-analysis / extraction /
 * classification; Sonnet = primary response / synthesis / judgment;
 * Opus = high-stakes drafting / budget + grant proposals.
 */
export const ROLE_FAMILY: Record<ModelRole, ModelFamily> = {
  fast: "haiku",
  balanced: "sonnet",
  deep: "opus",
};

/**
 * Committed fallback pins. NOT the source of truth — the live Models API
 * (via the discovery cron) is. These are the known-good ids the resolver
 * uses when no DB assignment is available, and the seed the
 * `kinetiks_model_assignments` table is initialised from.
 *
 * Build-time values (verified against this deployment's model registry):
 *   - `fast`     → the current Haiku snapshot (byte-identical to prior
 *                  usage, so fast tasks are behavior-preserving).
 *   - `balanced` → the current Sonnet (the upgrade off the retired
 *                  `claude-sonnet-4-20250514`).
 *   - `deep`     → the current Opus (unused by any task in v1; reserved
 *                  for high-stakes opt-in per CLAUDE.md).
 *
 * Discovery reconciles all three against `client.models.list()` and
 * proposes a flip if a newer model exists in a role's family — so a
 * slightly-stale seed self-corrects on the first approved discovery run.
 */
export const SEED_MODELS: Record<ModelRole, ModelId> = {
  fast: "claude-haiku-4-5-20251001",
  balanced: "claude-sonnet-4-6",
  deep: "claude-opus-4-8",
};

/**
 * Reader the resolver consults for the live role→model assignment.
 * Implementations keep an in-memory snapshot (no I/O on `getModel`) and
 * return `null` for a role to fall back to the seed. apps/id wires a
 * Supabase-backed reader over `kinetiks_model_assignments`.
 */
export interface ModelAssignmentReader {
  /** Current model id for a role, or null to use the seed pin. Synchronous. */
  getModel(role: ModelRole): ModelId | null;
}

let _reader: ModelAssignmentReader | null = null;

export function configureModelAssignmentReader(reader: ModelAssignmentReader | null): void {
  _reader = reader;
}

export function getModelAssignmentReader(): ModelAssignmentReader | null {
  return _reader;
}

/**
 * Resolve a role to the current concrete model id.
 *
 * Order: injected reader's assignment → `SEED_MODELS` fallback. A reader
 * that throws or returns null never breaks a call — the seed is always a
 * valid floor.
 */
export function resolveModel(role: ModelRole): ModelId {
  const reader = _reader;
  if (reader) {
    try {
      const assigned = reader.getModel(role);
      if (assigned) return assigned;
    } catch {
      // A failing reader must never break the call path; fall through to seed.
    }
  }
  return SEED_MODELS[role];
}

/** Parse the family from a concrete model id (e.g. `claude-sonnet-4-6` → `sonnet`).
 *  Returns null for ids outside the three known families (the discovery
 *  allowlist), so unknown/experimental families are never auto-adopted. */
export function familyOf(modelId: string): ModelFamily | null {
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("opus")) return "opus";
  return null;
}

/** Test-only escape hatch. */
export function _resetModelAssignmentReaderForTests(): void {
  _reader = null;
}
