import type { Proposal, ProposalConfidence } from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ownership hierarchy - higher number = higher priority.
 * User explicit data is SACRED and can never be overridden.
 */
const SOURCE_PRIORITY: Record<string, number> = {
  user_explicit: 5,
  user_implicit: 4,
  validated: 3,
  synapse: 2,
  inferred: 2,
  speculative: 1,
};

const CONFIDENCE_PRIORITY: Record<ProposalConfidence, number> = {
  validated: 3,
  inferred: 2,
  speculative: 1,
};

export interface ConflictResult {
  has_conflict: boolean;
  action: "accept" | "decline" | "escalate";
  reason: string | null;
  existing_source: string | null;
}

/**
 * Detect conflicts between an incoming Proposal and existing Context Structure data.
 *
 * Rules:
 * 1. User explicit data is SACRED - never override
 * 2. User implicit data beats all AI-generated data
 * 3. Higher confidence beats lower confidence
 * 4. Same confidence - newer wins (the incoming proposal)
 * 5. Escalate proposals always escalate (surface to user)
 */
export async function detectConflict(
  admin: SupabaseClient,
  proposal: Proposal
): Promise<ConflictResult> {
  // Escalate action always goes to user
  if (proposal.action === "escalate") {
    return {
      has_conflict: false,
      action: "escalate",
      reason: null,
      existing_source: null,
    };
  }

  const tableName = `kinetiks_context_${proposal.target_layer}`;

  const { data: existing, error } = await admin
    .from(tableName)
    .select("data, source")
    .eq("account_id", proposal.account_id)
    .single();

  // Distinguish DB errors from "no row"
  if (error) {
    // PGRST116 = "no rows returned" from .single() - this is expected for empty layers
    if (error.code === "PGRST116") {
      return {
        has_conflict: false,
        action: "accept",
        reason: null,
        existing_source: null,
      };
    }
    // Actual DB error - don't silently accept, surface the issue
    throw new Error(
      `Conflict detection failed for ${tableName}: ${error.message} (code: ${error.code})`
    );
  }

  if (!existing) {
    return {
      has_conflict: false,
      action: "accept",
      reason: null,
      existing_source: null,
    };
  }

  const existingSource = existing.source as string;
  const existingData = existing.data as Record<string, unknown>;

  // If existing data is empty, no conflict
  if (!existingData || Object.keys(existingData).length === 0) {
    return {
      has_conflict: false,
      action: "accept",
      reason: null,
      existing_source: existingSource,
    };
  }

  // Check if any proposed fields conflict with existing fields
  const conflictingFields = findConflictingFields(
    existingData,
    proposal.payload
  );

  if (conflictingFields.length === 0) {
    // No overlapping fields - pure addition, no conflict
    return {
      has_conflict: false,
      action: "accept",
      reason: null,
      existing_source: existingSource,
    };
  }

  // There are conflicting fields - apply ownership hierarchy
  // Normalize synapse sources: "synapse:dark_madder" -> "synapse"
  const normalizedExistingSource = existingSource.startsWith("synapse:")
    ? "synapse"
    : existingSource;
  const existingPriority = SOURCE_PRIORITY[normalizedExistingSource] ?? 0;
  const proposalPriority = CONFIDENCE_PRIORITY[proposal.confidence] ?? 1;

  // Rule 1: User explicit data is SACRED
  if (existingSource === "user_explicit") {
    return {
      has_conflict: true,
      action: "decline",
      reason: `user_data_sacred: fields [${conflictingFields.join(", ")}] were set by user`,
      existing_source: existingSource,
    };
  }

  // Rule 2: User implicit beats AI
  if (existingSource === "user_implicit" && proposalPriority < 4) {
    return {
      has_conflict: true,
      action: "decline",
      reason: `user_implicit_priority: fields [${conflictingFields.join(", ")}] were implicitly set by user`,
      existing_source: existingSource,
    };
  }

  // Rule 3: Higher confidence beats lower
  if (existingPriority > proposalPriority) {
    return {
      has_conflict: true,
      action: "decline",
      reason: `higher_confidence_exists: existing source '${existingSource}' (priority ${existingPriority}) > proposal confidence '${proposal.confidence}' (priority ${proposalPriority})`,
      existing_source: existingSource,
    };
  }

  // Rule 4: Same or lower existing confidence - newer wins
  return {
    has_conflict: true,
    action: "accept",
    reason: `newer_wins: proposal confidence '${proposal.confidence}' >= existing source '${existingSource}'`,
    existing_source: existingSource,
  };
}

/**
 * Find fields in the proposal payload that would overwrite non-null existing values.
 */
function findConflictingFields(
  existing: Record<string, unknown>,
  proposed: Record<string, unknown>
): string[] {
  const conflicts: string[] = [];

  for (const key of Object.keys(proposed)) {
    if (proposed[key] === null || proposed[key] === undefined) continue;

    const existingVal = existing[key];
    if (existingVal === null || existingVal === undefined) continue;

    // For arrays, check if there's overlap (not just existence)
    if (Array.isArray(existingVal) && existingVal.length === 0) continue;

    // For objects, check if empty
    if (
      typeof existingVal === "object" &&
      !Array.isArray(existingVal) &&
      Object.keys(existingVal as Record<string, unknown>).length === 0
    ) {
      continue;
    }

    // Values exist in both - this is a conflict
    if (!deepEqual(existingVal, proposed[key])) {
      conflicts.push(key);
    }
  }

  return conflicts;
}

/**
 * Deep equality check that is order-agnostic for object keys.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key, i) => key === bKeys[i] && deepEqual(aObj[key], bObj[key])
    );
  }

  return false;
}
