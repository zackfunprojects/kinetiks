/**
 * Privacy disclosure shown during onboarding before any platform
 * connection. Per Final Supplement §2.6 — plain language, must be
 * acknowledged before Reddit OAuth or Quora URL submission.
 *
 * The actual modal component lives in components/privacy/. This module
 * holds the canonical copy and the acknowledgement-tracking helper so
 * the same source of truth is used by the UI, the analytics events,
 * and the data export bundle.
 */

export const PRIVACY_DISCLOSURE_VERSION = "2026-04-07";

export const PRIVACY_DISCLOSURE_TEXT = `
DeskOf connects to your Reddit and Quora accounts to help you find and
participate in conversations. We store your posting history, the replies
you write through DeskOf, and performance data like upvotes and citations.

We use this data to improve YOUR experience: better opportunity matching,
smarter suggestions, and more accurate tracking. We never sell your data,
share it with other users, or use it to train models for others.

You can export or delete all of your DeskOf data at any time from your
Kinetiks ID settings. Deleting your account revokes all platform tokens,
removes all stored data within 24 hours, and purges your Operator Profile
from Cortex within 7 days.
`.trim();

export interface PrivacyAcknowledgement {
  version: string;
  acknowledged_at: string;
}

export function makeAcknowledgement(): PrivacyAcknowledgement {
  return {
    version: PRIVACY_DISCLOSURE_VERSION,
    acknowledged_at: new Date().toISOString(),
  };
}
