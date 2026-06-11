"use client";

import { useState } from "react";
import { Button } from "@kinetiks/ui";

const DELETE_ERROR_MESSAGE = "We couldn't delete your account. Try again.";
const CONFIRM_PHRASE = "delete my account";

/**
 * C2 - the live account-deletion flow, ported from the legacy
 * (dashboard)/settings page. Typed confirmation phrase before the
 * DELETE; hard redirect to /login on success.
 */
export function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phraseMatches = phrase.trim().toLowerCase() === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!phraseMatches || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      window.location.href = "/login";
    } catch {
      setError(DELETE_ERROR_MESSAGE);
      setDeleting(false);
    }
  }

  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--kt-danger)",
          margin: "0 0 24px",
        }}
      >
        Danger Zone
      </h3>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: "1px solid var(--kt-danger-soft)",
          background: "var(--kt-bg-muted)",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: "0 0 12px" }}>
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>

        {!confirming ? (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Delete Account
          </Button>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "var(--kt-fg-2)", margin: "0 0 8px" }}>
              Type <strong>{CONFIRM_PHRASE}</strong> to confirm.
            </p>
            <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                aria-label="Deletion confirmation phrase"
                autoFocus
                className="kt-field"
                style={{ flex: 1 }}
              />
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={!phraseMatches || deleting}
              >
                {deleting ? "Deleting..." : "Confirm"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  setPhrase("");
                  setError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
            {error && (
              <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "var(--kt-danger)" }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
