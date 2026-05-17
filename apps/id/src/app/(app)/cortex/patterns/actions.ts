"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertTransition } from "@kinetiks/lib/state-machines";
import { registerKinetiksStateMachines } from "@/lib/state-machines-init";

/**
 * Server Actions for the Cortex Patterns sub-tab per addendum §1.8 +
 * §1.11. Star / suppress / annotate / archive routes here from the
 * client; the Archivist is the canonical writer of
 * kinetiks_pattern_library, and these actions act under
 * actor.kind === "agent" with operatorKey === "archivist" because the
 * customer's intent is mediated by the Archivist before the row
 * changes.
 *
 * Each action:
 *   - Authenticates the user, resolves the account, asserts the pattern
 *     belongs to the account (defense-in-depth alongside RLS)
 *   - Performs the mutation via the service-role admin client
 *   - Writes a Ledger entry with pattern_id attached
 *   - revalidatePath("/cortex/patterns") so the page refetches
 */

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveAccountForPattern(
  patternId: string,
): Promise<
  | { ok: true; accountId: string; userId: string }
  | { ok: false; error: string }
> {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: pattern } = await admin
    .from("kinetiks_pattern_library")
    .select("account_id")
    .eq("id", patternId)
    .maybeSingle();
  if (!pattern) return { ok: false, error: "Pattern not found" };

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("id", pattern.account_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { ok: false, error: "Forbidden: pattern does not belong to you" };

  return { ok: true, accountId: account.id, userId: user.id };
}

async function writeUserOverrideLedger(args: {
  accountId: string;
  patternId: string;
  event_type: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("kinetiks_ledger").insert({
    account_id: args.accountId,
    event_type: args.event_type,
    source_app: "kinetiks_id",
    source_operator: "cortex_ui",
    target_layer: null,
    detail: { pattern_id: args.patternId, ...(args.detail ?? {}) },
  });
}

export async function starPattern(patternId: string, value: boolean): Promise<ActionResult> {
  const auth = await resolveAccountForPattern(patternId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("kinetiks_pattern_library")
    .update({ user_starred: value })
    .eq("id", patternId)
    .eq("account_id", auth.accountId);
  if (error) {
    console.error(
      `starPattern failed pattern=${patternId} account=${auth.accountId}: ${error.message}`,
    );
    return { ok: false, error: "Could not update star state" };
  }

  await writeUserOverrideLedger({
    accountId: auth.accountId,
    patternId,
    event_type: value ? "pattern_user_starred" : "pattern_user_unstarred",
  });

  revalidatePath("/cortex/patterns");
  return { ok: true };
}

export async function suppressPattern(patternId: string, value: boolean): Promise<ActionResult> {
  const auth = await resolveAccountForPattern(patternId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("kinetiks_pattern_library")
    .update({ user_suppressed: value })
    .eq("id", patternId)
    .eq("account_id", auth.accountId);
  if (error) {
    console.error(
      `suppressPattern failed pattern=${patternId} account=${auth.accountId}: ${error.message}`,
    );
    return { ok: false, error: "Could not update suppressed state" };
  }

  await writeUserOverrideLedger({
    accountId: auth.accountId,
    patternId,
    event_type: value ? "pattern_user_suppressed" : "pattern_user_unsuppressed",
  });

  revalidatePath("/cortex/patterns");
  return { ok: true };
}

export async function annotatePattern(
  patternId: string,
  annotation: string | null,
): Promise<ActionResult> {
  const trimmed = annotation === null ? null : annotation.trim();
  if (trimmed !== null && trimmed.length > 2000) {
    return { ok: false, error: "Annotation must be 2000 characters or fewer" };
  }

  const auth = await resolveAccountForPattern(patternId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("kinetiks_pattern_library")
    .update({ user_annotation: trimmed && trimmed.length > 0 ? trimmed : null })
    .eq("id", patternId)
    .eq("account_id", auth.accountId);
  if (error) {
    console.error(
      `annotatePattern failed pattern=${patternId} account=${auth.accountId}: ${error.message}`,
    );
    return { ok: false, error: "Could not update annotation" };
  }

  await writeUserOverrideLedger({
    accountId: auth.accountId,
    patternId,
    event_type: "pattern_user_annotated",
    detail: { annotation_length: trimmed === null ? 0 : trimmed.length },
  });

  revalidatePath("/cortex/patterns");
  return { ok: true };
}

export async function archivePattern(patternId: string): Promise<ActionResult> {
  registerKinetiksStateMachines();

  const auth = await resolveAccountForPattern(patternId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("kinetiks_pattern_library")
    .select("status")
    .eq("id", patternId)
    .eq("account_id", auth.accountId)
    .single();
  if (!current) {
    return { ok: false, error: "Pattern not found after auth check" };
  }
  if (current.status === "archived") {
    return { ok: true }; // Already archived; no-op.
  }

  try {
    assertTransition({
      entity: "kinetiks_pattern_library",
      from: current.status as "emerging" | "validated" | "declining",
      to: "archived",
      actor: { kind: "agent", operatorKey: "archivist", accountId: auth.accountId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Illegal transition";
    return { ok: false, error: message };
  }

  const { error } = await admin
    .from("kinetiks_pattern_library")
    .update({ status: "archived" })
    .eq("id", patternId)
    .eq("account_id", auth.accountId);
  if (error) {
    console.error(
      `archivePattern failed pattern=${patternId} account=${auth.accountId}: ${error.message}`,
    );
    return { ok: false, error: "Could not archive pattern" };
  }

  await writeUserOverrideLedger({
    accountId: auth.accountId,
    patternId,
    event_type: "pattern_archived",
    detail: { from: current.status, to: "archived", reason: "customer_archive" },
  });
  await writeUserOverrideLedger({
    accountId: auth.accountId,
    patternId,
    event_type: "pattern_arbitrated",
    detail: { from: current.status, to: "archived", reason: "customer_archive" },
  });

  revalidatePath("/cortex/patterns");
  return { ok: true };
}
