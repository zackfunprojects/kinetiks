/**
 * Per the platform contract (`docs/platform-contract.md`) + Kinetiks
 * Contract Addendum §3.3. A `KineticsAppManifest` is what each app
 * declares to plug into the platform.
 *
 * Phase 3 introduces the minimum shape needed for the Operator
 * Workflows extension:
 *  - `operator_registry`: optional; present iff the app uses internal
 *    Operator Workflows.
 *  - `default_standing_grants`: placeholder for Phase 5; the field is
 *    here so the type is forward-compatible from day one.
 *
 * Suite apps (Harvest, Dark Madder, etc.) do not yet have manifest
 * files. When they land, each app exports a single `manifest` constant
 * from `apps/<prefix>/src/manifest.ts` and the platform reads it at
 * boot.
 */

import type {
  ActionClassDescriptor,
  OperatorDescriptor,
  PatternTypeDescriptor,
  ToolDescriptor,
} from "./descriptors";
import type { DefaultStandingGrant } from "./default-grants";

export interface KineticsAppManifest {
  /** Canonical app key. Lowercase snake_case. e.g. `kinetiks_id`, `harvest`, `dark_madder`. */
  readonly app: string;
  /** Display metadata for the app switcher and floating pill. */
  readonly display: {
    readonly name: string;
    readonly tagline: string;
    readonly color: string;
  };
  /** Tools the app exposes to the Tool Registry. */
  readonly tools?: readonly ToolDescriptor[];
  /** Action classes the app may invoke (Kinetiks Contract Addendum §2.4). */
  readonly action_classes?: readonly ActionClassDescriptor[];
  /** Pattern types the app emits (Kinetiks Contract Addendum §1.3). */
  readonly pattern_types?: readonly PatternTypeDescriptor[];
  /**
   * Operators the app exposes for internal Workflow dispatch
   * (Kinetiks Contract Addendum §3.3). Apps without internal Workflows
   * omit this field entirely.
   */
  readonly operator_registry?: readonly OperatorDescriptor[];
  /**
   * Per the Kinetiks Contract Addendum §2.6. The minimal authority
   * this app needs to be useful without explicit customer action,
   * proposed at signup as the customer's first authority decisions.
   * Validated at app boot by
   * `apps/id/src/lib/manifest/validate.ts` against the Action Class
   * Registry — a malformed default fails startup, not runtime.
   */
  readonly default_standing_grants?: readonly DefaultStandingGrant[];
}
