"use client";

import { useState } from "react";
import {
  PRIVACY_DISCLOSURE_TEXT,
  PRIVACY_DISCLOSURE_VERSION,
} from "@/lib/privacy/disclosure";

interface Props {
  /**
   * Called once the user explicitly acknowledges the disclosure.
   * The caller is responsible for storing the acknowledgement and
   * advancing onboarding to the next step.
   */
  onAcknowledge: (version: string) => void;
}

/**
 * Privacy disclosure modal — shown during onboarding step 1 BEFORE
 * any platform connection. The user must explicitly acknowledge.
 * Per Final Supplement #2.6 and onboarding step 1 in Final Supplement #4.
 */
export function PrivacyDisclosureModal({ onAcknowledge }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15, 17, 23, 0.75)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6"
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
        }}
      >
        <h2
          id="privacy-title"
          className="mb-1 text-xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Before we connect anything
        </h2>
        <p
          className="mb-4 text-xs uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          Privacy disclosure · v{PRIVACY_DISCLOSURE_VERSION}
        </p>
        <div
          className="mb-5 max-h-72 overflow-y-auto whitespace-pre-line text-sm leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {PRIVACY_DISCLOSURE_TEXT}
        </div>
        <label
          className="mb-5 flex items-start gap-2 text-sm"
          style={{ color: "var(--text-primary)" }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>
            I&apos;ve read this and understand how DeskOf will use my data.
          </span>
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!confirmed}
            onClick={() => onAcknowledge(PRIVACY_DISCLOSURE_VERSION)}
            className="rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "#ffffff",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
