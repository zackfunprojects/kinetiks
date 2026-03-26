import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { EmailStyleConfig } from "@/types/composer";

/**
 * GET /api/hv/composer/styles
 * List style presets for the authenticated user.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const { data, error: queryError } = await admin
    .from("hv_style_presets")
    .select("*")
    .eq("kinetiks_id", auth.account_id)
    .order("created_at", { ascending: true });

  if (queryError) {
    return apiError(`Failed to fetch presets: ${queryError.message}`, 500);
  }

  return apiSuccess({ presets: data ?? [] });
}

/**
 * POST /api/hv/composer/styles
 * Save a new style preset.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: { name: string; config: EmailStyleConfig; is_default?: boolean };
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as typeof body;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.name?.trim()) return apiError("name is required", 400);
  if (!body.config) return apiError("config is required", 400);

  const admin = createAdminClient();

  // If setting as default, unset any existing default first
  if (body.is_default) {
    await admin
      .from("hv_style_presets")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("kinetiks_id", auth.account_id)
      .eq("is_default", true);
  }

  const { data, error: insertError } = await admin
    .from("hv_style_presets")
    .insert({
      kinetiks_id: auth.account_id,
      name: body.name.trim(),
      config: body.config,
      is_default: body.is_default ?? false,
    })
    .select("*")
    .single();

  if (insertError) {
    return apiError(`Failed to save preset: ${insertError.message}`, 500);
  }

  return apiSuccess({ preset: data });
}
