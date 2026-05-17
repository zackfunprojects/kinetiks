/**
 * Strict environment-variable parsing with Zod.
 *
 * Per CLAUDE.md: never read `process.env.X` directly in feature code.
 * Import the parsed value from `@kinetiks/lib/env`. Missing required
 * vars are a startup failure, not a runtime surprise.
 */

import { z, type ZodSchema } from "zod";

/**
 * Parse process.env against a Zod schema. On failure, throws a single
 * combined error so the app refuses to boot rather than partially
 * succeeding.
 */
export function parseEnv<T>(schema: ZodSchema<T>, source: NodeJS.ProcessEnv = process.env): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[env] Failed to validate environment:\n${issues}`);
  }
  return result.data;
}

/** Common reusable env schema fragments. */
export const envFragments = {
  url: z.string().url(),
  optionalUrl: z.string().url().optional(),
  jwt: z.string().min(20),
  port: z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number.parseInt(s, 10))
    .pipe(z.number().int().min(0).max(65535)),
  bool: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .transform((v) => v === "true" || v === "1"),
  email: z.string().email(),
  nonEmpty: z.string().min(1),
};

/**
 * Canonical Kinetiks server-side env schema. Apps extend this with their
 * own additions; client-side code must use the NEXT_PUBLIC_* subset only.
 *
 * Optional values are intentional — missing them disables the feature, not
 * the app boot. Required values cause boot to fail.
 */
export const kinetiksServerEnvSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: envFragments.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: envFragments.jwt,
  SUPABASE_SERVICE_ROLE_KEY: envFragments.jwt,

  // Anthropic
  ANTHROPIC_API_KEY: envFragments.nonEmpty,

  // Optional integrations
  FIRECRAWL_API_KEY: z.string().optional(),
  PEOPLE_DATA_LABS_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // OAuth providers (optional)
  GA4_CLIENT_ID: z.string().optional(),
  GA4_CLIENT_SECRET: z.string().optional(),
  GSC_CLIENT_ID: z.string().optional(),
  GSC_CLIENT_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  META_ADS_ACCESS_TOKEN: z.string().optional(),
  HUBSPOT_CLIENT_ID: z.string().optional(),
  HUBSPOT_CLIENT_SECRET: z.string().optional(),

  GOOGLE_WORKSPACE_CLIENT_ID: z.string().optional(),
  GOOGLE_WORKSPACE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_365_CLIENT_ID: z.string().optional(),
  MICROSOFT_365_CLIENT_SECRET: z.string().optional(),

  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),

  // App-level
  NEXT_PUBLIC_APP_URL: envFragments.optionalUrl,
  KINETIKS_ENCRYPTION_KEY: envFragments.nonEmpty,

  // Internal service-to-service auth (Edge Functions → Node API routes).
  // Optional locally; required in production for the metric-cache-cron and
  // any future cron that needs to call into apps/id.
  INTERNAL_SERVICE_SECRET: z.string().optional(),
  // Where Edge Functions reach the Node API. Defaults at the call site.
  IDENTITY_API_URL: envFragments.optionalUrl,
});

export type KinetiksServerEnv = z.infer<typeof kinetiksServerEnvSchema>;

/** Lazy-loaded, cached canonical server env. */
let _serverEnv: KinetiksServerEnv | null = null;
export function serverEnv(): KinetiksServerEnv {
  if (_serverEnv) return _serverEnv;
  _serverEnv = parseEnv(kinetiksServerEnvSchema);
  return _serverEnv;
}
