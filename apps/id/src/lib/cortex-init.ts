/**
 * Wires Cortex package dependencies for the apps/id host.
 *
 * Imported as a side-effect from `@/lib/cortex` so that any code path that
 * touches Cortex automatically registers the apps/id webhook dispatcher
 * before any Cortex function runs.
 */
import "server-only";
import { configureCortex } from "@kinetiks/cortex";
import { dispatchEvent } from "@/lib/webhooks/deliver";

configureCortex({ dispatchEvent });
