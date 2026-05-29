import "server-only";

import type { KineticsAppManifest } from "@kinetiks/types";
import { kinetiksIdManifest } from "./kinetiks-id-manifest";

/**
 * Static manifest registry for v1 (apps/id-only scope per CLAUDE.md).
 *
 * When suite apps land (Harvest, Dark Madder, etc.), each app exports
 * its own manifest from `apps/<prefix>/src/manifest.ts` and the
 * registry composes them at boot. The registry is intentionally
 * static-import-driven rather than dynamic — manifests are
 * code-checked, not config-loaded, so they round-trip through the
 * TypeScript compiler before reaching the runtime.
 *
 * The `default_standing_grants` flow uses this registry to:
 *   - Render the onboarding Permissions step (signup-accept path)
 *   - Drive the manifest-diff cron's per-(account, app) pass
 *
 * Both surfaces filter manifests to those that actually declare
 * defaults via `listManifestsWithDefaults()`.
 */
const REGISTERED_MANIFESTS: readonly KineticsAppManifest[] = [kinetiksIdManifest];

/** All registered manifests, including those without defaults. */
export function getRegisteredManifests(): readonly KineticsAppManifest[] {
  return REGISTERED_MANIFESTS;
}

/**
 * Manifests that declare at least one default standing grant. The
 * signup Permissions step renders one section per manifest in this
 * list; the diff cron iterates this list per account.
 */
export function listManifestsWithDefaults(): readonly KineticsAppManifest[] {
  return REGISTERED_MANIFESTS.filter(
    (m) => (m.default_standing_grants?.length ?? 0) > 0,
  );
}

/** Lookup a manifest by `app` key. Returns undefined if not registered. */
export function getManifestByApp(app: string): KineticsAppManifest | undefined {
  return REGISTERED_MANIFESTS.find((m) => m.app === app);
}
