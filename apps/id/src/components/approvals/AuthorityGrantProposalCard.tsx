"use client";

/**
 * AuthorityGrantProposalCard per Phase 4 — Chunk 7.
 *
 * Renders an authority_grant_proposal approval. Customer-facing copy
 * NEVER uses the literal phrase "Authority Grant" (the framing word
 * is "permission"). Each capability's plain-language description is
 * rendered directly — the Authority Agent already produced it via
 * the action class's customer_template.
 *
 * Three actions: Approve, Edit, Reject. Edit opens an editor modal
 * (deferred to Chunk 7+ follow-up) that produces a replacement grant
 * payload submitted via the same approve action with `edits` set.
 *
 * Per CLAUDE.md design rules: every visual value references a kt-*
 * token; no hardcoded colors / sizes / radii.
 */

import { useState } from "react";

import type { ApprovalRecord } from "@/lib/approvals/types";
import type {
  EscalationTrigger,
  GrantProposalEnvelopeMember,
  GrantedCapability,
} from "@kinetiks/types";

interface AuthorityGrantProposalCardProps {
  approval: ApprovalRecord;
  /** Approve as-proposed, or with an edited grant payload. */
  onApprove: (id: string, edits?: { grant: GrantProposalEnvelopeMember["grant"] }) => void;
  onReject: (id: string, reason: string) => void;
  systemName: string | null;
}

interface AuthorityProposalPreview {
  grant_id?: string;
  grant?: GrantProposalEnvelopeMember["grant"];
  reasoning?: string;
  evidence?: {
    patterns_referenced?: Array<{
      pattern_id: string;
      pattern_type: string;
      lift_ratio: number | null;
      why_relevant: string;
    }>;
    similar_past_grants?: Array<{ grant_id: string; outcome: string }>;
    ledger_summary?: {
      proposals_last_90d: number;
      approval_rate: number;
      most_common_edit_type: string | null;
    };
    identity_signals?: string[];
  };
}

export function AuthorityGrantProposalCard({
  approval,
  onApprove,
  onReject,
  systemName,
}: AuthorityGrantProposalCardProps) {
  // The persist RPC stores preview = { grant_id, grant, reasoning,
  // evidence }; the ApprovalPreview wrapper may nest under `content`.
  const preview = (approval.preview ?? {}) as {
    content?: AuthorityProposalPreview;
  } & AuthorityProposalPreview;
  const grant = preview.grant ?? preview.content?.grant;
  const reasoning = preview.reasoning ?? preview.content?.reasoning ?? "";
  const evidence = preview.evidence ?? preview.content?.evidence ?? {};

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (!grant) {
    return (
      <div
        style={{
          padding: "var(--kt-s-3)",
          borderRadius: "var(--kt-radius-2)",
          border: "1px solid var(--kt-border-2)",
          background: "var(--kt-bg-subtle)",
          marginBottom: "var(--kt-s-2)",
          color: "var(--kt-fg-2)",
          fontSize: "var(--kt-fs-13)",
        }}
      >
        Permission proposal is incomplete; ask {systemName ?? "your system"} to
        re-propose.
      </div>
    );
  }

  // Customer-facing framing: "permission", never "Authority Grant".
  return (
    <div
      style={{
        padding: "var(--kt-s-3)",
        borderRadius: "var(--kt-radius-2)",
        border: "1px solid var(--kt-accent-soft)",
        background: "var(--kt-bg-muted)",
        marginBottom: "var(--kt-s-2)",
      }}
    >
      {/* Header: priority badge + source */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--kt-s-2)",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        <span
          style={{
            fontSize: "var(--kt-fs-10)",
            fontWeight: "var(--kt-fw-semi)",
            padding: "2px 6px",
            borderRadius: "var(--kt-radius-1)",
            background: "var(--kt-accent-soft)",
            color: "var(--kt-accent)",
            textTransform: "uppercase",
          }}
        >
          Permission
        </span>
        <span style={{ fontSize: "var(--kt-fs-11)", color: "var(--kt-fg-3)" }}>
          Proposed by {systemName ?? "your system"}
        </span>
      </div>

      {/* Scope */}
      <div
        style={{
          fontSize: "var(--kt-fs-13)",
          fontWeight: "var(--kt-fw-semi)",
          color: "var(--kt-fg-1)",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        {grant.scope_description}
      </div>

      {/* Capabilities */}
      <div
        style={{
          padding: "var(--kt-s-2) var(--kt-s-3)",
          borderRadius: "var(--kt-radius-1)",
          background: "var(--kt-bg-base)",
          border: "1px solid var(--kt-border-2)",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        <div
          style={{
            fontSize: "var(--kt-fs-11)",
            color: "var(--kt-fg-3)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: "var(--kt-s-2)",
          }}
        >
          What you'd be giving permission for
        </div>
        <ul
          style={{
            listStyle: "disc inside",
            padding: 0,
            margin: 0,
            fontSize: "var(--kt-fs-13)",
            color: "var(--kt-fg-2)",
            lineHeight: "var(--kt-lh-body)",
          }}
        >
          {grant.granted_capabilities.map((cap: GrantedCapability, i: number) => (
            <li key={`${cap.action_class}-${i}`} style={{ marginBottom: "var(--kt-s-1)" }}>
              {cap.description}
              {cap.rate_limit
                ? ` Up to ${cap.rate_limit.count} per ${cap.rate_limit.window}.`
                : ""}
            </li>
          ))}
        </ul>
      </div>

      {/* Escalation triggers */}
      {grant.escalation_triggers && grant.escalation_triggers.length > 0 && (
        <div
          style={{
            padding: "var(--kt-s-2) var(--kt-s-3)",
            borderRadius: "var(--kt-radius-1)",
            background: "var(--kt-bg-base)",
            border: "1px solid var(--kt-border-2)",
            marginBottom: "var(--kt-s-2)",
          }}
        >
          <div
            style={{
              fontSize: "var(--kt-fs-11)",
              color: "var(--kt-fg-3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: "var(--kt-s-2)",
            }}
          >
            We'll check with you when
          </div>
          <ul
            style={{
              listStyle: "disc inside",
              padding: 0,
              margin: 0,
              fontSize: "var(--kt-fs-13)",
              color: "var(--kt-fg-2)",
              lineHeight: "var(--kt-lh-body)",
            }}
          >
            {grant.escalation_triggers.map((t: EscalationTrigger, i: number) => (
              <li key={`${t.type}-${i}`} style={{ marginBottom: "var(--kt-s-1)" }}>
                {t.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expiry + spending envelope */}
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
        {grant.expires_at && (
          <span>
            Expires{" "}
            <strong style={{ color: "var(--kt-fg-2)" }}>
              {new Date(grant.expires_at).toLocaleDateString()}
            </strong>
          </span>
        )}
        {grant.max_unapproved_spend_per_day !== null && (
          <span>
            Up to{" "}
            <strong style={{ color: "var(--kt-fg-2)" }}>
              {grant.spending_currency} {grant.max_unapproved_spend_per_day}
            </strong>{" "}
            per day
          </span>
        )}
      </div>

      {/* Reasoning */}
      {reasoning && (
        <details
          style={{
            marginBottom: "var(--kt-s-3)",
            fontSize: "var(--kt-fs-12)",
            color: "var(--kt-fg-2)",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              color: "var(--kt-fg-3)",
              marginBottom: "var(--kt-s-1)",
            }}
          >
            Why {systemName ?? "your system"} is asking for this
          </summary>
          <div
            style={{
              marginTop: "var(--kt-s-2)",
              padding: "var(--kt-s-2)",
              background: "var(--kt-bg-base)",
              border: "1px solid var(--kt-border-2)",
              borderRadius: "var(--kt-radius-1)",
              whiteSpace: "pre-wrap",
            }}
          >
            {reasoning}
          </div>
          {evidence.patterns_referenced &&
            evidence.patterns_referenced.length > 0 && (
              <div
                style={{
                  marginTop: "var(--kt-s-2)",
                  fontSize: "var(--kt-fs-11)",
                  color: "var(--kt-fg-3)",
                }}
              >
                Based on {evidence.patterns_referenced.length} pattern
                {evidence.patterns_referenced.length === 1 ? "" : "s"} from your
                operation.
              </div>
            )}
        </details>
      )}

      {/* Reject form */}
      {rejectOpen && (
        <div
          style={{
            marginBottom: "var(--kt-s-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--kt-s-2)",
          }}
        >
          <label
            htmlFor={`reject-reason-${approval.id}`}
            style={{ fontSize: "var(--kt-fs-12)", color: "var(--kt-fg-2)" }}
          >
            Why are you rejecting? (Helps {systemName ?? "your system"} learn.)
          </label>
          <textarea
            id={`reject-reason-${approval.id}`}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            style={{
              padding: "var(--kt-s-2)",
              borderRadius: "var(--kt-radius-1)",
              border: "1px solid var(--kt-border-2)",
              background: "var(--kt-bg-base)",
              color: "var(--kt-fg-1)",
              fontSize: "var(--kt-fs-13)",
              resize: "vertical",
            }}
          />
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: "var(--kt-s-2)",
          justifyContent: "flex-end",
        }}
      >
        {!rejectOpen ? (
          <>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              style={{
                padding: "var(--kt-s-2) var(--kt-s-3)",
                borderRadius: "var(--kt-radius-1)",
                border: "1px solid var(--kt-border-2)",
                background: "var(--kt-bg-base)",
                color: "var(--kt-fg-2)",
                cursor: "pointer",
                fontSize: "var(--kt-fs-12)",
              }}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => onApprove(approval.id)}
              style={{
                padding: "var(--kt-s-2) var(--kt-s-3)",
                borderRadius: "var(--kt-radius-1)",
                border: "1px solid var(--kt-accent)",
                background: "var(--kt-accent)",
                color: "var(--kt-bg-base)",
                cursor: "pointer",
                fontSize: "var(--kt-fs-12)",
                fontWeight: "var(--kt-fw-semi)",
              }}
            >
              Give permission
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setRejectOpen(false);
                setRejectReason("");
              }}
              style={{
                padding: "var(--kt-s-2) var(--kt-s-3)",
                borderRadius: "var(--kt-radius-1)",
                border: "1px solid var(--kt-border-2)",
                background: "var(--kt-bg-base)",
                color: "var(--kt-fg-2)",
                cursor: "pointer",
                fontSize: "var(--kt-fs-12)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={rejectReason.trim().length === 0}
              onClick={() => {
                onReject(approval.id, rejectReason.trim());
                setRejectOpen(false);
                setRejectReason("");
              }}
              style={{
                padding: "var(--kt-s-2) var(--kt-s-3)",
                borderRadius: "var(--kt-radius-1)",
                border: "1px solid var(--kt-danger)",
                background:
                  rejectReason.trim().length === 0
                    ? "var(--kt-bg-subtle)"
                    : "var(--kt-danger)",
                color:
                  rejectReason.trim().length === 0
                    ? "var(--kt-fg-3)"
                    : "var(--kt-bg-base)",
                cursor:
                  rejectReason.trim().length === 0 ? "not-allowed" : "pointer",
                fontSize: "var(--kt-fs-12)",
                fontWeight: "var(--kt-fw-semi)",
              }}
            >
              Confirm reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
