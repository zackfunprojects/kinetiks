/**
 * apps/id Cortex entry point.
 *
 * Importing this module guarantees the Cortex dispatcher is wired to the
 * apps/id webhook delivery system before any Cortex API is called.
 *
 * Always import from `@/lib/cortex` rather than `@kinetiks/cortex` directly
 * inside apps/id, so the init side-effect runs.
 */
import "./cortex-init";

export * from "@kinetiks/cortex";
