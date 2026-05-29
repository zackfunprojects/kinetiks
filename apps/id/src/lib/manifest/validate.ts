import "server-only";

import type {
  DefaultStandingGrant,
  EscalationTrigger,
  EscalationTriggerType,
  GrantedCapability,
  KineticsAppManifest,
} from "@kinetiks/types";
import {
  ESCALATION_TRIGGER_CONDITION_SCHEMAS,
  parseEscalationCondition,
} from "@kinetiks/types";
import {
  assertActionClass,
  extractTemplatePlaceholders,
} from "@kinetiks/tools";

/**
 * Manifest validation per the Kinetiks Contract Addendum §2.6.
 *
 * Called once at app boot from `apps/id/src/lib/manifest/boot.ts`
 * (which is invoked by `instrumentation-node.ts` after the Action
 * Class Registry boots). A malformed manifest is a boot failure, not
 * a runtime surprise — the customer would otherwise see a broken
 * Permissions step at signup.
 *
 * Each manifest's `default_standing_grants` array is checked end-to-
 * end. The validator never mutates input; it asserts and throws with
 * a clear, actionable error message on first failure.
 */

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const AUTHORITY_GRANT_PHRASE = /authority\s+grant/i;

/**
 * Validate every registered manifest. Throws on first failure with a
 * boot-friendly error message that points at the offending entry.
 */
export function validateAllManifests(
  manifests: readonly KineticsAppManifest[],
): void {
  for (const m of manifests) validateManifest(m);
}

/**
 * Validate a single manifest. Public so tests can target one manifest
 * at a time without booting the whole registry.
 */
export function validateManifest(manifest: KineticsAppManifest): void {
  // App key sanity (manifests live in the registry by app key).
  if (!manifest.app || !KEY_PATTERN.test(manifest.app)) {
    throw new ManifestValidationError(
      `Manifest .app must match /^[a-z][a-z0-9_]*$/, got: ${JSON.stringify(manifest.app)}`,
    );
  }
  if (!manifest.display || !manifest.display.name) {
    throw new ManifestValidationError(
      `Manifest for "${manifest.app}" missing display.name`,
    );
  }

  const defaults = manifest.default_standing_grants;
  if (!defaults || defaults.length === 0) return; // No defaults declared; nothing to validate.

  const seenKeys = new Set<string>();
  defaults.forEach((d, idx) => validateDefault(manifest.app, idx, d, seenKeys));
}

function validateDefault(
  appKey: string,
  idx: number,
  d: DefaultStandingGrant,
  seenKeys: Set<string>,
): void {
  const ctx = `${appKey}.default_standing_grants[${idx}]`;

  // Key shape and uniqueness within the manifest.
  if (!d.key || !KEY_PATTERN.test(d.key)) {
    throw new ManifestValidationError(
      `${ctx}.key must match /^[a-z][a-z0-9_]*$/, got: ${JSON.stringify(d.key)}`,
    );
  }
  if (seenKeys.has(d.key)) {
    throw new ManifestValidationError(
      `${ctx}.key "${d.key}" is declared more than once in ${appKey}'s manifest`,
    );
  }
  seenKeys.add(d.key);

  // Customer-facing language: the literal phrase "Authority Grant"
  // must not appear in any plain-language string the customer will
  // read. The signup card renders `description` verbatim and the
  // capability descriptions either verbatim or via customer_template.
  if (AUTHORITY_GRANT_PHRASE.test(d.description)) {
    throw new ManifestValidationError(
      `${ctx}.description contains banned phrase "Authority Grant" (use "permission")`,
    );
  }

  // Standing-grant invariant (the type literal enforces this at compile
  // time; the runtime guard catches `as any` escapes from authors who
  // bypass the type system).
  if (d.expires_at !== null) {
    throw new ManifestValidationError(
      `${ctx}.expires_at must be null for default standing grants`,
    );
  }

  if (!Array.isArray(d.granted_capabilities) || d.granted_capabilities.length === 0) {
    throw new ManifestValidationError(
      `${ctx}.granted_capabilities must be a non-empty array`,
    );
  }
  d.granted_capabilities.forEach((c, ci) =>
    validateCapability(`${ctx}.granted_capabilities[${ci}]`, c),
  );

  if (!Array.isArray(d.escalation_triggers)) {
    throw new ManifestValidationError(
      `${ctx}.escalation_triggers must be an array (may be empty)`,
    );
  }
  d.escalation_triggers.forEach((t, ti) =>
    validateTrigger(`${ctx}.escalation_triggers[${ti}]`, t),
  );
}

function validateCapability(ctx: string, c: GrantedCapability): void {
  // Resolve the action class. If unregistered, fail fast at boot —
  // the registry is the source of truth.
  let descriptor;
  try {
    descriptor = assertActionClass(c.action_class);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManifestValidationError(
      `${ctx}.action_class "${c.action_class}" is not registered. ${msg}`,
    );
  }

  if (!descriptor.available_in_default_standing_grants) {
    throw new ManifestValidationError(
      `${ctx}.action_class "${c.action_class}" has available_in_default_standing_grants=false; cannot appear in a default`,
    );
  }
  if (descriptor.always_requires_budget_attachment) {
    throw new ManifestValidationError(
      `${ctx}.action_class "${c.action_class}" requires Budget attachment; cannot appear in a default`,
    );
  }

  // Constraint validation. The descriptor's Zod schema is the source
  // of truth — if it rejects, the manifest is broken.
  const constraintsResult = descriptor.constraint_schema.safeParse(c.constraints);
  if (!constraintsResult.success) {
    const issues = constraintsResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ManifestValidationError(
      `${ctx}.constraints failed the constraint_schema for "${c.action_class}": ${issues}`,
    );
  }

  // Customer-facing capability description must not say "Authority
  // Grant" either.
  if (AUTHORITY_GRANT_PHRASE.test(c.description)) {
    throw new ManifestValidationError(
      `${ctx}.description contains banned phrase "Authority Grant" (use "permission")`,
    );
  }

  // Rate limit: a default's rate is at or below the action class's
  // recommended default. Defaults are deliberately conservative.
  if (c.rate_limit && descriptor.rate_limit_default) {
    const normalize = (count: number, window: typeof descriptor.rate_limit_default.window) => {
      // Normalize to per-day for comparison. Coarse but sufficient — a
      // default that exceeds the class's recommended cap on any axis
      // is a manifest bug.
      const perDay: Record<typeof window, number> = {
        minute: 60 * 24,
        hour: 24,
        day: 1,
        week: 1 / 7,
      };
      return count * perDay[window];
    };
    const grantPerDay = normalize(c.rate_limit.count, c.rate_limit.window);
    const classPerDay = normalize(
      descriptor.rate_limit_default.count,
      descriptor.rate_limit_default.window,
    );
    if (grantPerDay > classPerDay) {
      throw new ManifestValidationError(
        `${ctx}.rate_limit (${c.rate_limit.count}/${c.rate_limit.window}) exceeds the action class's rate_limit_default (${descriptor.rate_limit_default.count}/${descriptor.rate_limit_default.window})`,
      );
    }
  }

  // customer_template must render cleanly against these constraints.
  // The validator simulates the render path the signup card will
  // take so a placeholder mismatch surfaces at boot, not when the
  // customer hits the page.
  const placeholders = extractTemplatePlaceholders(descriptor.customer_template);
  const constraintRecord = constraintsResult.data as Record<string, unknown>;
  for (const name of placeholders) {
    if (!(name in constraintRecord)) {
      throw new ManifestValidationError(
        `${ctx}: action class "${c.action_class}" customer_template references "${name}" but the proposed default's constraints do not provide it`,
      );
    }
  }
}

function validateTrigger(ctx: string, t: EscalationTrigger): void {
  if (AUTHORITY_GRANT_PHRASE.test(t.description)) {
    throw new ManifestValidationError(
      `${ctx}.description contains banned phrase "Authority Grant" (use "permission")`,
    );
  }
  const triggerType = t.type as EscalationTriggerType;
  if (!(triggerType in ESCALATION_TRIGGER_CONDITION_SCHEMAS)) {
    throw new ManifestValidationError(
      `${ctx}.type "${t.type}" is not a registered escalation trigger type`,
    );
  }
  try {
    parseEscalationCondition(triggerType, t.condition);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManifestValidationError(
      `${ctx}.condition failed validation for trigger type "${t.type}": ${msg}`,
    );
  }
}

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(`[manifest-validator] ${message}`);
    this.name = "ManifestValidationError";
  }
}
