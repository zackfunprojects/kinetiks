/**
 * Default Standing Grants — per the Kinetiks Contract Addendum §2.6.
 *
 * Each app's `KineticsAppManifest` declares zero or more
 * `DefaultStandingGrant` entries. These are the minimal authority the
 * app needs to be useful without explicit customer action — Marcus
 * sending Slack notifications, drafting emails, surfacing
 * observations. They are proposed at signup as the customer's first
 * authority decisions and never include any spend-bearing or
 * external-state-mutating action class. The line is the contract:
 * defaults make an app useful for understanding, never for acting.
 *
 * The manifest validator in `apps/id/src/lib/manifest/validate.ts`
 * runs at app boot and asserts:
 *   - `key` is unique within the manifest and matches
 *     /^[a-z][a-z0-9_]*$/
 *   - `description` does not contain the literal phrase "Authority
 *     Grant" (case-insensitive); the customer-facing word is
 *     "permission"
 *   - every `granted_capabilities[].action_class` references a
 *     registered ActionClassDescriptor whose
 *     `available_in_default_standing_grants` is true and
 *     `always_requires_budget_attachment` is false
 *   - every `granted_capabilities[].constraints` validates against
 *     the action class's `constraint_schema`
 *   - every `granted_capabilities[].rate_limit` is at or below the
 *     action class's `rate_limit_default`
 *   - the action class's `customer_template` renders cleanly against
 *     the proposed constraints (no missing placeholders)
 *
 * Append-only contract per CLAUDE.md. Breaking changes to this shape
 * require a platform-contract version bump.
 */

import type { GrantedCapability, EscalationTrigger } from "./authority-grants";

export interface DefaultStandingGrant {
  /**
   * Stable per-manifest identifier for diff detection. Lowercase
   * snake_case, unique within the manifest. The
   * `authority-defaults-diff-cron` joins on
   * (account_id, default_origin_app, default_origin_key) to detect
   * which manifest defaults a customer has not yet decided on, so
   * the key must be stable across manifest revisions. Changing a
   * key amounts to declaring a brand-new default (the diff cron
   * will propose it again to every account).
   */
  readonly key: string;

  /**
   * App-supplied plain-language headline rendered above the capability
   * list on the signup card. Must NOT contain "Authority Grant"
   * (manifest validator enforces). The customer-facing wording for
   * grants is "permission".
   */
  readonly description: string;

  /**
   * Each capability references a registered action class whose
   * `available_in_default_standing_grants` is true, with constraints
   * that validate against the action class's `constraint_schema`.
   * Validated at boot, not at runtime — a malformed default fails the
   * app startup so the bug surfaces immediately.
   */
  readonly granted_capabilities: readonly GrantedCapability[];

  /**
   * Conservative for v1 defaults: usually empty. Manifests may declare
   * triggers later; each is validated against its per-type schema by
   * the manifest validator at boot.
   */
  readonly escalation_triggers: readonly EscalationTrigger[];

  /**
   * Standing grants never expire by time — they expire only on
   * customer revocation. The schema-level `null` literal makes this
   * explicit at the type level, so a manifest author cannot
   * accidentally declare a default with a fixed expiry.
   */
  readonly expires_at: null;
}
