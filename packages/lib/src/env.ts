/**
 * Strict environment-variable parsing with Zod.
 *
 * Per CLAUDE.md: never read `process.env.X` directly in feature code.
 * Import the parsed value from `@kinetiks/lib/env`. Missing required
 * vars are a startup failure, not a runtime surprise.
 */

import { z, type ZodTypeAny } from "zod";

/**
 * Parse process.env against a Zod schema. On failure, throws a single
 * combined error so the app refuses to boot rather than partially
 * succeeding.
 *
 * The generic is `ZodTypeAny` (not `ZodSchema<T>`) so callers can use
 * schemas with transforms — input type may differ from output type —
 * such as boolean feature flags parsed from `"true"`/`"false"` strings.
 */
export function parseEnv<S extends ZodTypeAny>(
  schema: S,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<S> {
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
  // D2: the From address for the Resend fallback path of system email
  // (used when an account has no google_workspace connection). Must
  // be on a Resend-verified domain. Defaults at the call site.
  RESEND_FROM_EMAIL: envFragments.email.optional(),

  // OAuth providers (optional)
  GA4_CLIENT_ID: z.string().optional(),
  GA4_CLIENT_SECRET: z.string().optional(),
  GSC_CLIENT_ID: z.string().optional(),
  GSC_CLIENT_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  // E1: subscription billing (Checkout + webhook). All optional — when
  // unset, the billing UI renders an honest "not configured" state and
  // the checkout/webhook routes refuse with a configuration error.
  // STRIPE_WEBHOOK_SECRET is the signing secret of the Stripe webhook
  // endpoint pointed at /api/billing/webhook. The three price ids map
  // the paid BillingPlan tiers to Stripe Prices (recurring, monthly).
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  META_ADS_ACCESS_TOKEN: z.string().optional(),
  HUBSPOT_CLIENT_ID: z.string().optional(),
  HUBSPOT_CLIENT_SECRET: z.string().optional(),

  GOOGLE_WORKSPACE_CLIENT_ID: z.string().optional(),
  GOOGLE_WORKSPACE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_365_CLIENT_ID: z.string().optional(),
  MICROSOFT_365_CLIENT_SECRET: z.string().optional(),

  // D2: no longer read by the outbound dispatcher (per-account bot
  // tokens come from the slack system connection). Retained in the
  // schema for any external tooling that still sets it; safe to unset.
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),

  // App-level
  NEXT_PUBLIC_APP_URL: envFragments.optionalUrl,
  KINETIKS_ENCRYPTION_KEY: envFragments.nonEmpty,

  // Admin panel: comma-separated auth.users ids that boot seeds into
  // kinetiks_admins as superusers (the bootstrap for the first admin(s);
  // the table is the source of truth thereafter). Optional — unset means
  // no bootstrap, and admins are managed entirely in-table.
  ADMIN_BOOTSTRAP_USER_IDS: z.string().optional(),

  // Internal service-to-service auth (Edge Functions → Node API routes).
  // Optional locally; required in production for the metric-cache-cron and
  // any future cron that needs to call into apps/id.
  INTERNAL_SERVICE_SECRET: z.string().optional(),
  // Where Edge Functions reach the Node API. Defaults at the call site.
  IDENTITY_API_URL: envFragments.optionalUrl,

  // Nango (D2 — integration platform for GA4/GSC/Stripe/Meta Ads/Google Ads/HubSpot).
  // Optional during the D2 migration; once Slice 5 (GA4 migration) lands the
  // first three become effectively required for any account that wants live
  // metrics. NANGO_HOST defaults to Nango Cloud at the call site.
  NANGO_SECRET_KEY: z.string().optional(),
  NANGO_PUBLIC_KEY: z.string().optional(),
  NANGO_WEBHOOK_SECRET: z.string().optional(),
  NANGO_HOST: envFragments.optionalUrl,

  // Phase 1.5 — Fixture emitter feature flag. When true, the fixture
  // cron POSTs synthetic Harvest-shaped pattern emissions to
  // /api/synapse/patterns so downstream Pattern Library calibration,
  // Marcus brief inclusion, and Ledger writes have substrate to run
  // against without real suite apps. Default false; production should
  // explicitly set true only for staging/demo accounts. Every row
  // emitted carries `source_app: "kinetiks_fixtures"` and every Ledger
  // entry carries `detail.is_fixture: true`.
  KINETIKS_FIXTURES_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type KinetiksServerEnv = z.infer<typeof kinetiksServerEnvSchema>;

/** Lazy-loaded, cached canonical server env. */
let _serverEnv: KinetiksServerEnv | null = null;
export function serverEnv(): KinetiksServerEnv {
  if (_serverEnv) return _serverEnv;
  _serverEnv = parseEnv(kinetiksServerEnvSchema);
  return _serverEnv;
}
