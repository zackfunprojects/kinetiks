"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireAdmin, type AdminContext } from "@/lib/auth/admin";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import {
  applyModelFlip,
  recordFlipRejection,
  overrideRoleModel,
  setRoleFrozen,
  type FlipApplyResult,
} from "@/lib/ai/model-flip-apply";

/**
 * Admin model-management actions. Each runs requireAdmin (the layout gate
 * is UI-only), validates its inputs with Zod, and funnels unexpected
 * failures to Sentry while returning a user-safe message — never raw
 * detail.
 */

const roleSchema = z.enum(["fast", "balanced", "deep"]);
const familySchema = z.enum(["haiku", "sonnet", "opus"]);
const uuidSchema = z.string().uuid();

async function guard(
  action: string,
  fn: (ctx: AdminContext) => Promise<FlipApplyResult>,
): Promise<FlipApplyResult> {
  try {
    const ctx = await requireAdmin();
    const res = await fn(ctx);
    if (res.ok) revalidatePath("/admin/models");
    return res;
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: "Invalid input." };
    const forbidden = err instanceof Error && err.message.startsWith("forbidden");
    if (!forbidden) {
      await captureException(err, {
        tags: { route: "admin/models", action, stage: "action", app: "id" },
        extra: {},
      });
    }
    return { ok: false, error: forbidden ? USER_SAFE.GENERIC_FORBIDDEN : USER_SAFE.GENERIC_ERROR };
  }
}

export async function approveFlipAction(proposalId: string): Promise<FlipApplyResult> {
  return guard("model_flip_approve", (ctx) =>
    applyModelFlip(uuidSchema.parse(proposalId), ctx.userId),
  );
}

export async function rejectFlipAction(
  proposalId: string,
  reason: string | null,
): Promise<FlipApplyResult> {
  return guard("model_flip_reject", () => {
    const id = uuidSchema.parse(proposalId);
    const r = reason == null ? null : z.string().max(500).parse(reason);
    return recordFlipRejection(id, r);
  });
}

export async function setFrozenAction(role: string, frozen: boolean): Promise<FlipApplyResult> {
  return guard("model_freeze", () =>
    setRoleFrozen(roleSchema.parse(role), z.boolean().parse(frozen)),
  );
}

export async function overrideModelAction(
  role: string,
  modelId: string,
  family: string,
): Promise<FlipApplyResult> {
  return guard("model_override", (ctx) =>
    overrideRoleModel(
      roleSchema.parse(role),
      z.string().min(1).max(200).parse(modelId.trim()),
      familySchema.parse(family),
      ctx.userId,
    ),
  );
}
