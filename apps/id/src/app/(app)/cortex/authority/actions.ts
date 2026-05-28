"use server";

/**
 * Next.js Server Actions for the Cortex Authority sub-tab.
 *
 * Thin wrappers over the lifecycle module at
 * apps/id/src/lib/cortex/authority/lifecycle.ts that:
 *   - Authenticate the user and resolve their account
 *   - Verify the grant belongs to the account (defense in depth on top
 *     of RLS — the lifecycle helpers run under service-role)
 *   - Delegate to the canonical pause / resume / revoke / narrow paths
 *   - revalidatePath("/cortex/authority") so the sub-tab refetches
 *
 * Phase 4 — Chunk 8.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  pauseGrant,
  resumeGrant,
  revokeGrant,
  narrowGrant,
} from "@/lib/cortex/authority/lifecycle";
import { registerKinetiksStateMachines } from "@/lib/state-machines-init";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import type { GrantProposalEnvelopeMember } from "@kinetiks/types";

interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function resolveAccountForGrant(grantId: string): Promise<
  | { ok: true; accountId: string; userId: string }
  | { ok: false; error: string }
> {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: grant } = await admin
    .from("kinetiks_authority_grants")
    .select("account_id")
    .eq("id", grantId)
    .maybeSingle();
  if (!grant) return { ok: false, error: "Permission not found" };

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("id", grant.account_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account)
    return { ok: false, error: "Forbidden: permission does not belong to you" };

  return { ok: true, accountId: account.id, userId: user.id };
}

/** active → paused. Halts new actions immediately. */
export async function pauseGrantAction(
  grantId: string,
  reason?: string,
): Promise<ActionResult> {
  const resolved = await resolveAccountForGrant(grantId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  registerKinetiksStateMachines();
  const admin = createAdminClient();
  try {
    await pauseGrant(admin, {
      account_id: resolved.accountId,
      user_id: resolved.userId,
      grant_id: grantId,
      reason,
    });
    revalidatePath("/cortex/authority");
    return { ok: true };
  } catch (err) {
    // Internal `[authority/lifecycle]` paths must not leak to the
    // customer (CLAUDE.md). Capture full detail to Sentry; return the
    // user-safe constant for the UI.
    await captureException(err, {
      tags: {
        app: "id",
        route: "/cortex/authority",
        action: "authority.pause",
        stage: "execute",
      },
      user: { id: resolved.accountId },
      extra: { grantId },
    });
    return { ok: false, error: USER_SAFE.GENERIC_PERMISSION_PAUSE };
  }
}

/** paused → active. Resumes covered actions. */
export async function resumeGrantAction(
  grantId: string,
  reason?: string,
): Promise<ActionResult> {
  const resolved = await resolveAccountForGrant(grantId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  registerKinetiksStateMachines();
  const admin = createAdminClient();
  try {
    await resumeGrant(admin, {
      account_id: resolved.accountId,
      user_id: resolved.userId,
      grant_id: grantId,
      reason,
    });
    revalidatePath("/cortex/authority");
    return { ok: true };
  } catch (err) {
    await captureException(err, {
      tags: {
        app: "id",
        route: "/cortex/authority",
        action: "authority.resume",
        stage: "execute",
      },
      user: { id: resolved.accountId },
      extra: { grantId },
    });
    return { ok: false, error: USER_SAFE.GENERIC_PERMISSION_RESUME };
  }
}

/** active|paused → revoked. Terminal. Reason is required. */
export async function revokeGrantAction(
  grantId: string,
  reason: string,
): Promise<ActionResult> {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { ok: false, error: "Reason is required when revoking" };
  }
  if (reason.length > 2000) {
    return { ok: false, error: "Reason exceeds 2000 characters" };
  }

  const resolved = await resolveAccountForGrant(grantId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  registerKinetiksStateMachines();
  const admin = createAdminClient();
  try {
    await revokeGrant(admin, {
      account_id: resolved.accountId,
      user_id: resolved.userId,
      grant_id: grantId,
      reason,
    });
    revalidatePath("/cortex/authority");
    return { ok: true };
  } catch (err) {
    await captureException(err, {
      tags: {
        app: "id",
        route: "/cortex/authority",
        action: "authority.revoke",
        stage: "execute",
      },
      user: { id: resolved.accountId },
      extra: { grantId },
    });
    return { ok: false, error: USER_SAFE.GENERIC_PERMISSION_REVOKE };
  }
}

/**
 * Narrow: revoke active grant + propose tighter successor for re-approval.
 * The successor must satisfy the same structural validation the Authority
 * Agent uses; the narrow lifecycle helper enforces this and throws on
 * failure.
 */
export async function narrowGrantAction(
  grantId: string,
  successor: GrantProposalEnvelopeMember["grant"],
  reason?: string,
): Promise<
  ActionResult<{ successor_grant_id: string; successor_approval_id: string }>
> {
  const resolved = await resolveAccountForGrant(grantId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  registerKinetiksStateMachines();
  const admin = createAdminClient();
  try {
    const result = await narrowGrant(admin, {
      account_id: resolved.accountId,
      user_id: resolved.userId,
      grant_id: grantId,
      successor,
      reason,
    });
    revalidatePath("/cortex/authority");
    revalidatePath("/");
    return { ok: true, data: result };
  } catch (err) {
    await captureException(err, {
      tags: {
        app: "id",
        route: "/cortex/authority",
        action: "authority.narrow",
        stage: "execute",
      },
      user: { id: resolved.accountId },
      extra: { grantId },
    });
    return { ok: false, error: USER_SAFE.GENERIC_PERMISSION_NARROW };
  }
}
