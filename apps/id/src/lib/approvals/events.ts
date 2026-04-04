import type { ApprovalEvent, ApprovalEventType, ActionCategory } from "./types";

type EventListener = (event: ApprovalEvent) => void | Promise<void>;

const listeners: EventListener[] = [];

/**
 * Register a listener for approval events.
 */
export function onApprovalEvent(listener: EventListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Emit an approval event to all registered listeners.
 */
export async function emitApprovalEvent(
  type: ApprovalEventType,
  approvalId: string,
  accountId: string,
  actionCategory: ActionCategory,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const event: ApprovalEvent = {
    type,
    approval_id: approvalId,
    account_id: accountId,
    action_category: actionCategory,
    metadata,
    timestamp: new Date().toISOString(),
  };

  // Fire listeners concurrently, don't let one failure block others
  await Promise.allSettled(
    listeners.map((listener) => Promise.resolve(listener(event)))
  );
}
