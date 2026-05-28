"use client";

/**
 * AuthorityGrantCard renders a single grant on the Cortex Authority
 * sub-tab. Pure presentation + a pause/resume/revoke/narrow action
 * row at the bottom; the actual mutations route through the Server
 * Actions in apps/id/src/app/(app)/cortex/authority/actions.ts.
 *
 * Customer-facing copy NEVER uses the literal phrase "Authority Grant".
 * The framing word in the UI is "permission"; the grant's identity is
 * the `scope_description` ("Standing Slack permission",
 * "Acme Q1 LinkedIn Campaign Authority"). Per CLAUDE.md every visual
 * value references a kt-* token; no hardcoded colors / sizes / radii.
 *
 * Capability rendering: the GrantedCapability's `description` field
 * is the plain-language string the Authority Agent produced from the
 * action class's `customer_template`. This component does NOT
 * re-render the template — that already happened at proposal time.
 *
 * Phase 4 — Chunk 8.
 */

import { useState, useTransition } from "react";

import type { AuthorityGrant } from "@kinetiks/types";

import {
  pauseGrantAction,
  resumeGrantAction,
  revokeGrantAction,
} from "@/app/(app)/cortex/authority/actions";

interface AuthorityGrantCardProps {
  grant: AuthorityGrant;
  /** Plain-language system name from the customer's identity layer
   *  (Marcus / Kit / whatever). Falls back to "your system". */
  systemName: string | null;
}

export function AuthorityGrantCard({
  grant,
  systemName,
}: AuthorityGrantCardProps) {
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");

  const isActive = grant.status === "active";
  const isPaused = grant.status === "paused";
  const isTerminal = grant.status === "revoked" || grant.status === "expired";

  const handlePause = () => {
    if (!isActive) return;
    setActionError(null);
    startTransition(async () => {
      const result = await pauseGrantAction(grant.id);
      if (!result.ok) setActionError(result.error ?? "Pause failed");
    });
  };

  const handleResume = () => {
    if (!isPaused) return;
    setActionError(null);
    startTransition(async () => {
      const result = await resumeGrantAction(grant.id);
      if (!result.ok) setActionError(result.error ?? "Resume failed");
    });
  };

  const handleRevoke = () => {
    if (isTerminal) return;
    if (revokeReason.trim().length === 0) {
      setActionError("Please add a short reason for revoking");
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await revokeGrantAction(grant.id, revokeReason.trim());
      if (!result.ok) setActionError(result.error ?? "Revoke failed");
      else {
        setRevokeOpen(false);
        setRevokeReason("");
      }
    });
  };

  return (
    <article
      style={{
        padding: "var(--kt-s-4)",
        borderRadius: "var(--kt-radius-2)",
        border: "1px solid var(--kt-border-2)",
        background: "var(--kt-bg-base)",
        marginBottom: "var(--kt-s-3)",
        opacity: isTerminal ? 0.6 : 1,
      }}
    >
      {/* Header: status + scope description + days remaining */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--kt-s-3)",
          marginBottom: "var(--kt-s-3)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--kt-s-2)",
              marginBottom: "var(--kt-s-1)",
            }}
          >
            <StatusPill status={grant.status} />
            <span
              style={{
                fontSize: "var(--kt-fs-11)",
                color: "var(--kt-fg-3)",
                textTransform: "uppercase",
                letterSpacing: "var(--kt-tr-eyebrow)",
              }}
            >
              {scopeLabel(grant.scope_type)}
            </span>
          </div>
          <h3
            style={{
              fontSize: "var(--kt-fs-15)",
              fontWeight: "var(--kt-fw-semi)",
              color: "var(--kt-fg-1)",
              margin: 0,
              lineHeight: "var(--kt-lh-tight)",
            }}
          >
            {grant.scope_description}
          </h3>
        </div>
        {grant.expires_at && !isTerminal && (
          <div
            style={{
              fontSize: "var(--kt-fs-11)",
              color: "var(--kt-fg-3)",
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            <ExpiryLabel expires_at={grant.expires_at} />
          </div>
        )}
      </div>

      {/* Capabilities (plain language). */}
      <div
        style={{
          fontSize: "var(--kt-fs-11)",
          color: "var(--kt-fg-3)",
          textTransform: "uppercase",
          letterSpacing: "var(--kt-tr-eyebrow)",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        What {systemName ?? "your system"} can do
      </div>
      <ul
        style={{
          listStyle: "disc inside",
          padding: 0,
          margin: 0,
          fontSize: "var(--kt-fs-13)",
          color: "var(--kt-fg-2)",
          lineHeight: "var(--kt-lh-body)",
          marginBottom: "var(--kt-s-3)",
        }}
      >
        {grant.granted_capabilities.map((cap, i) => (
          <li
            key={`${cap.action_class}-${i}`}
            style={{ marginBottom: "var(--kt-s-1)" }}
          >
            {cap.description}
            {cap.rate_limit
              ? ` Up to ${cap.rate_limit.count} per ${cap.rate_limit.window}.`
              : ""}
          </li>
        ))}
      </ul>

      {/* Escalation triggers */}
      {grant.escalation_triggers && grant.escalation_triggers.length > 0 && (
        <>
          <div
            style={{
              fontSize: "var(--kt-fs-11)",
              color: "var(--kt-fg-3)",
              textTransform: "uppercase",
              letterSpacing: "var(--kt-tr-eyebrow)",
              marginBottom: "var(--kt-s-2)",
            }}
          >
            When {systemName ?? "your system"} will check with you first
          </div>
          <ul
            style={{
              listStyle: "disc inside",
              padding: 0,
              margin: 0,
              fontSize: "var(--kt-fs-13)",
              color: "var(--kt-fg-2)",
              lineHeight: "var(--kt-lh-body)",
              marginBottom: "var(--kt-s-3)",
            }}
          >
            {grant.escalation_triggers.map((trigger, i) => (
              <li
                key={`${trigger.type}-${i}`}
                style={{ marginBottom: "var(--kt-s-1)" }}
              >
                {trigger.description}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Usage summary */}
      {!isTerminal && grant.usage_summary && (
        <UsageSummary summary={grant.usage_summary} />
      )}

      {/* Spending envelope */}
      {grant.max_unapproved_spend_per_day !== null && (
        <div
          style={{
            fontSize: "var(--kt-fs-12)",
            color: "var(--kt-fg-3)",
            marginBottom: "var(--kt-s-3)",
          }}
        >
          Spending cap:{" "}
          <strong style={{ color: "var(--kt-fg-2)" }}>
            {grant.spending_currency} {grant.max_unapproved_spend_per_day}
          </strong>{" "}
          per day
          {grant.max_unapproved_spend_per_action !== null && (
            <>
              {", "}
              <strong style={{ color: "var(--kt-fg-2)" }}>
                {grant.spending_currency} {grant.max_unapproved_spend_per_action}
              </strong>{" "}
              per action
            </>
          )}
          .
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div
          style={{
            padding: "var(--kt-s-2)",
            borderRadius: "var(--kt-radius-1)",
            background: "var(--kt-accent-danger-soft, var(--kt-bg-muted))",
            color: "var(--kt-accent-danger, var(--kt-fg-1))",
            fontSize: "var(--kt-fs-12)",
            marginBottom: "var(--kt-s-2)",
          }}
        >
          {actionError}
        </div>
      )}

      {/* Action buttons */}
      {!isTerminal && !revokeOpen && (
        <div
          style={{
            display: "flex",
            gap: "var(--kt-s-2)",
            flexWrap: "wrap",
            paddingTop: "var(--kt-s-2)",
            borderTop: "1px solid var(--kt-border-2)",
          }}
        >
          {isActive && (
            <ActionButton
              label="Pause"
              onClick={handlePause}
              disabled={isPending}
              variant="secondary"
            />
          )}
          {isPaused && (
            <ActionButton
              label="Resume"
              onClick={handleResume}
              disabled={isPending}
              variant="primary"
            />
          )}
          <ActionButton
            label="Revoke"
            onClick={() => setRevokeOpen(true)}
            disabled={isPending}
            variant="danger"
          />
        </div>
      )}

      {/* Revoke confirmation */}
      {revokeOpen && (
        <div
          style={{
            paddingTop: "var(--kt-s-2)",
            borderTop: "1px solid var(--kt-border-2)",
          }}
        >
          <label
            htmlFor={`revoke-reason-${grant.id}`}
            style={{
              display: "block",
              fontSize: "var(--kt-fs-12)",
              color: "var(--kt-fg-2)",
              marginBottom: "var(--kt-s-1)",
            }}
          >
            Why are you revoking this permission?
          </label>
          <textarea
            id={`revoke-reason-${grant.id}`}
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            disabled={isPending}
            maxLength={2000}
            placeholder="e.g. switching to a tighter set of channels"
            aria-label="Revocation reason"
            style={{
              width: "100%",
              minHeight: 72,
              padding: "var(--kt-s-2)",
              borderRadius: "var(--kt-radius-1)",
              border: "1px solid var(--kt-border-2)",
              background: "var(--kt-bg-subtle)",
              color: "var(--kt-fg-1)",
              fontSize: "var(--kt-fs-13)",
              fontFamily: "inherit",
              marginBottom: "var(--kt-s-2)",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: "var(--kt-s-2)" }}>
            <ActionButton
              label={isPending ? "Revoking..." : "Confirm revoke"}
              onClick={handleRevoke}
              disabled={isPending || revokeReason.trim().length === 0}
              variant="danger"
            />
            <ActionButton
              label="Cancel"
              onClick={() => {
                setRevokeOpen(false);
                setRevokeReason("");
                setActionError(null);
              }}
              disabled={isPending}
              variant="secondary"
            />
          </div>
        </div>
      )}

      {/* Terminal-state footer */}
      {isTerminal && (
        <div
          style={{
            paddingTop: "var(--kt-s-2)",
            borderTop: "1px solid var(--kt-border-2)",
            fontSize: "var(--kt-fs-12)",
            color: "var(--kt-fg-3)",
          }}
        >
          {grant.status === "revoked" && (
            <>
              Revoked
              {grant.revoked_at &&
                ` on ${new Date(grant.revoked_at).toLocaleDateString()}`}
              {grant.revocation_reason && ` — ${grant.revocation_reason}`}
            </>
          )}
          {grant.status === "expired" && (
            <>
              Expired
              {grant.revoked_at &&
                ` on ${new Date(grant.revoked_at).toLocaleDateString()}`}
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ============================================================
// Helpers
// ============================================================

function StatusPill({ status }: { status: AuthorityGrant["status"] }) {
  const palette = pillPalette(status);
  return (
    <span
      style={{
        fontSize: "var(--kt-fs-10)",
        fontWeight: "var(--kt-fw-semi)",
        padding: "var(--kt-s-1) var(--kt-s-2)",
        borderRadius: "var(--kt-radius-1)",
        background: palette.bg,
        color: palette.fg,
        textTransform: "uppercase",
        letterSpacing: "var(--kt-tr-eyebrow)",
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

function statusLabel(status: AuthorityGrant["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "proposed":
      return "Proposed";
    case "revoked":
      return "Revoked";
    case "expired":
      return "Expired";
  }
}

function pillPalette(status: AuthorityGrant["status"]): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case "active":
      return {
        bg: "var(--kt-accent-success-soft, var(--kt-accent-soft))",
        fg: "var(--kt-accent-success, var(--kt-accent))",
      };
    case "paused":
      return {
        bg: "var(--kt-accent-warning-soft, var(--kt-bg-muted))",
        fg: "var(--kt-accent-warning, var(--kt-fg-1))",
      };
    case "proposed":
      return {
        bg: "var(--kt-accent-soft)",
        fg: "var(--kt-accent)",
      };
    case "revoked":
    case "expired":
      return {
        bg: "var(--kt-bg-muted)",
        fg: "var(--kt-fg-3)",
      };
  }
}

function scopeLabel(scope_type: AuthorityGrant["scope_type"]): string {
  switch (scope_type) {
    case "standing":
      return "Standing";
    case "campaign":
      return "Campaign";
    case "workflow":
      return "Workflow";
    case "program":
      return "Program";
  }
}

function ExpiryLabel({ expires_at }: { expires_at: string }) {
  const expiresAt = new Date(expires_at);
  const now = Date.now();
  const msRemaining = expiresAt.getTime() - now;
  const daysRemaining = Math.round(msRemaining / (24 * 60 * 60 * 1000));

  if (daysRemaining <= 0) {
    return <>Expires today</>;
  }
  if (daysRemaining === 1) return <>Expires tomorrow</>;
  if (daysRemaining <= 14) return <>Expires in {daysRemaining} days</>;
  return <>Expires {expiresAt.toLocaleDateString()}</>;
}

function UsageSummary({
  summary,
}: {
  summary: AuthorityGrant["usage_summary"];
}) {
  // Defensive ?? {} against a partially-hydrated grant — the default
  // server-side row carries action_counts as `{}`, but a row from the
  // expiry feed lookup in page.tsx only carries scope_description and
  // would render UsageSummary if the parent passed it (it doesn't),
  // and the nightly rollup race could surface a transient null.
  const actionCounts = summary.action_counts ?? {};
  const escalations = summary.escalations_triggered ?? 0;
  const totalActions = Object.values(actionCounts).reduce(
    (sum, count) => sum + (typeof count === "number" ? count : 0),
    0,
  );
  if (totalActions === 0 && escalations === 0) {
    return (
      <div
        style={{
          fontSize: "var(--kt-fs-12)",
          color: "var(--kt-fg-3)",
          marginBottom: "var(--kt-s-3)",
          fontStyle: "italic",
        }}
      >
        No actions taken yet
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--kt-s-3)",
        flexWrap: "wrap",
        fontSize: "var(--kt-fs-12)",
        color: "var(--kt-fg-3)",
        marginBottom: "var(--kt-s-3)",
      }}
    >
      <span>
        Used:{" "}
        <strong style={{ color: "var(--kt-fg-2)" }}>{totalActions}</strong>{" "}
        action{totalActions === 1 ? "" : "s"}
      </span>
      {escalations > 0 && (
        <span>
          Checked with you:{" "}
          <strong style={{ color: "var(--kt-fg-2)" }}>
            {escalations}
          </strong>{" "}
          time{escalations === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary" | "danger";
}

function ActionButton({ label, onClick, disabled, variant }: ActionButtonProps) {
  const palette = buttonPalette(variant);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "var(--kt-s-2) var(--kt-s-3)",
        borderRadius: "var(--kt-radius-1)",
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        fontSize: "var(--kt-fs-12)",
        fontWeight: "var(--kt-fw-semi)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        // Motion tokens per CLAUDE.md — no hardcoded durations or
        // easings. The global @media (prefers-reduced-motion: reduce)
        // rule in packages/ui/styles/kinetiks-tokens.css already
        // forces transition-duration to 0.01ms, so no per-component
        // media query is needed.
        transition: "background var(--kt-dur-1) var(--kt-ease-standard)",
      }}
    >
      {label}
    </button>
  );
}

function buttonPalette(variant: "primary" | "secondary" | "danger"): {
  bg: string;
  fg: string;
  border: string;
} {
  switch (variant) {
    case "primary":
      return {
        bg: "var(--kt-accent)",
        fg: "var(--kt-fg-inverse, white)",
        border: "var(--kt-accent)",
      };
    case "secondary":
      return {
        bg: "transparent",
        fg: "var(--kt-fg-1)",
        border: "var(--kt-border-2)",
      };
    case "danger":
      return {
        bg: "transparent",
        fg: "var(--kt-accent-danger, var(--kt-fg-1))",
        border: "var(--kt-border-2)",
      };
  }
}
