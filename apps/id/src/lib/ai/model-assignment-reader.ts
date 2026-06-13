/**
 * Supabase-backed ModelAssignmentReader — makes @kinetiks/ai's role
 * resolution read the live `kinetiks_model_assignments` mapping instead
 * of only the committed SEED_MODELS.
 *
 * The resolver's `getModel(role)` is on the hot path of every Claude
 * call, so it must be synchronous and never do I/O. This reader keeps an
 * in-memory snapshot of the (tiny, 3-row) mapping and serves `getModel`
 * from it. The snapshot is refreshed out of band:
 *   - once at boot (instrumentation-node fires `refreshModelAssignments`),
 *   - lazily on read when older than REFRESH_TTL_MS (stale-while-
 *     revalidate: returns the current snapshot, kicks off a background
 *     refresh; a single in-flight guard prevents stampedes),
 *   - immediately after an operator approves a flip (Slice 3 calls
 *     `refreshModelAssignments()` so the new model takes effect at once).
 *
 * Empty snapshot (pre-first-refresh, or a row genuinely absent) → the
 * resolver falls back to SEED_MODELS. A failed refresh leaves the prior
 * snapshot intact (and logs); the seed is always a safe floor. Model
 * flips are rare, so a few minutes of staleness is acceptable and the
 * seed/old-value is never wrong-enough to break a call.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { MODEL_ROLES, type ModelId, type ModelRole, type ModelAssignmentReader } from "@kinetiks/ai";

import { createAdminClient } from "@/lib/supabase/admin";

/** Stale-after window for the lazy background refresh. */
const REFRESH_TTL_MS = 5 * 60 * 1000;

const snapshot = new Map<ModelRole, ModelId>();
let lastRefreshedAt = 0;
let refreshInFlight: Promise<void> | null = null;

interface AssignmentRow {
  role: string;
  assigned_model_id: string;
}

function isModelRole(value: string): value is ModelRole {
  return (MODEL_ROLES as readonly string[]).includes(value);
}

/**
 * Reload the role→model snapshot from kinetiks_model_assignments. Safe to
 * call concurrently — a single in-flight promise is shared. On error the
 * existing snapshot is preserved (never cleared) so resolution keeps
 * working on the last-known-good mapping (or the seed).
 */
export function refreshModelAssignments(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const admin = createAdminClient() as unknown as SupabaseClient;
      const { data, error } = await admin
        .from("kinetiks_model_assignments")
        .select("role, assigned_model_id");
      if (error) {
        // eslint-disable-next-line no-console
        console.warn(`[model-assignment-reader] refresh failed: ${error.message}`);
        return;
      }
      const rows = (data ?? []) as AssignmentRow[];
      for (const row of rows) {
        if (isModelRole(row.role) && typeof row.assigned_model_id === "string" && row.assigned_model_id) {
          snapshot.set(row.role, row.assigned_model_id);
        }
      }
      lastRefreshedAt = Date.now();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export const supabaseModelAssignmentReader: ModelAssignmentReader = {
  getModel(role: ModelRole): ModelId | null {
    // Lazy stale-while-revalidate: serve the snapshot now, refresh in the
    // background if it has aged out. Never awaits (hot path).
    if (Date.now() - lastRefreshedAt > REFRESH_TTL_MS && !refreshInFlight) {
      void refreshModelAssignments();
    }
    return snapshot.get(role) ?? null;
  },
};

/** Test-only: reset the in-memory snapshot. */
export function _resetModelAssignmentSnapshotForTests(): void {
  snapshot.clear();
  lastRefreshedAt = 0;
  refreshInFlight = null;
}
