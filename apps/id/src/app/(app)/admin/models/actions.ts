"use server";

import { revalidatePath } from "next/cache";

import type { ModelRole, ModelFamily } from "@kinetiks/ai";

import { requireAdmin } from "@/lib/auth/admin";
import {
  applyModelFlip,
  recordFlipRejection,
  overrideRoleModel,
  setRoleFrozen,
  type FlipApplyResult,
} from "@/lib/ai/model-flip-apply";

/**
 * Admin model-management actions. Each re-checks admin membership server-
 * side (the layout gate is UI-only) before mutating the platform mapping.
 */

export async function approveFlipAction(proposalId: string): Promise<FlipApplyResult> {
  const ctx = await requireAdmin();
  const res = await applyModelFlip(proposalId, ctx.userId);
  if (res.ok) revalidatePath("/admin/models");
  return res;
}

export async function rejectFlipAction(
  proposalId: string,
  reason: string | null,
): Promise<FlipApplyResult> {
  await requireAdmin();
  const res = await recordFlipRejection(proposalId, reason);
  if (res.ok) revalidatePath("/admin/models");
  return res;
}

export async function setFrozenAction(
  role: ModelRole,
  frozen: boolean,
): Promise<FlipApplyResult> {
  await requireAdmin();
  const res = await setRoleFrozen(role, frozen);
  if (res.ok) revalidatePath("/admin/models");
  return res;
}

export async function overrideModelAction(
  role: ModelRole,
  modelId: string,
  family: ModelFamily,
): Promise<FlipApplyResult> {
  const ctx = await requireAdmin();
  const res = await overrideRoleModel(role, modelId.trim(), family, ctx.userId);
  if (res.ok) revalidatePath("/admin/models");
  return res;
}
