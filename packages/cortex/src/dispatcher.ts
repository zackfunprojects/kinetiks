/**
 * Cortex event dispatcher injection.
 *
 * Cortex is a pure package and must not import from any consuming app.
 * Apps that want Cortex events delivered through their own webhook
 * infrastructure call `configureCortex({ dispatchEvent })` once at startup.
 * If no dispatcher is configured, Cortex events are silently no-op.
 */

export type CortexEventName =
  | "proposal.accepted"
  | "proposal.declined"
  | "routing.sent"
  | "confidence.changed";

export type CortexEventDispatcher = (
  accountId: string,
  event: CortexEventName,
  data: Record<string, unknown>
) => Promise<void> | void;

interface CortexConfig {
  dispatchEvent?: CortexEventDispatcher;
}

let config: CortexConfig = {};

/**
 * Configure Cortex with app-level dependencies. Call once at app startup.
 * Safe to call multiple times — last call wins.
 */
export function configureCortex(opts: CortexConfig): void {
  config = { ...config, ...opts };
}

/**
 * Internal: dispatch a Cortex event through the configured dispatcher.
 * No-op if no dispatcher has been configured.
 */
export async function dispatchCortexEvent(
  accountId: string,
  event: CortexEventName,
  data: Record<string, unknown>
): Promise<void> {
  const dispatcher = config.dispatchEvent;
  if (!dispatcher) return;
  try {
    await dispatcher(accountId, event, data);
  } catch (err) {
    // Cortex never throws on dispatch failures — events are fire-and-forget
    console.error(`Cortex dispatchEvent("${event}") failed:`, err);
  }
}
