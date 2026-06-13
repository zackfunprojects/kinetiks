"use client";

import { useState, useTransition } from "react";
import { Card, Button, Badge, Pill, EmptyState, Input } from "@kinetiks/ui";
import type { ModelRole, ModelFamily } from "@kinetiks/ai";

import { captureException, USER_SAFE } from "@/lib/observability/sentry";

import {
  approveFlipAction,
  rejectFlipAction,
  setFrozenAction,
  overrideModelAction,
} from "@/app/(app)/admin/models/actions";

export interface AdminAssignment {
  role: ModelRole;
  assigned_model_id: string;
  family: ModelFamily;
  source: string;
  frozen: boolean;
  released_at: string | null;
  updated_at: string;
}

export interface AdminProposal {
  id: string;
  role: ModelRole;
  from_model: string;
  to_model: string;
  family: ModelFamily;
  released_at?: string | null;
  created_at?: string;
  status?: string;
  decided_at?: string | null;
  reject_reason?: string | null;
}

interface Props {
  assignments: AdminAssignment[];
  pending: AdminProposal[];
  history: AdminProposal[];
  loadError: boolean;
}

const ROLE_BLURB: Record<ModelRole, string> = {
  fast: "Pre-analysis, classification, extraction, lightweight rewrites.",
  balanced: "Primary responses, synthesis, judgment.",
  deep: "High-stakes drafting, budget & grant proposals.",
};

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function ModelManager({ assignments, pending, history, loadError }: Props) {
  const [pendingAction, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [overriding, setOverriding] = useState<ModelRole | null>(null);
  const [overrideId, setOverrideId] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await fn();
        setMessage(
          r.ok
            ? { tone: "ok", text: okText }
            : { tone: "error", text: r.error ?? USER_SAFE.GENERIC_ERROR },
        );
        if (r.ok) {
          setRejecting(null);
          setRejectReason("");
          setOverriding(null);
          setOverrideId("");
        }
      } catch (err) {
        // A thrown server action / network failure skips the {ok} path.
        void captureException(err, {
          tags: { route: "admin/models", action: "model_action", stage: "client", app: "id" },
          extra: {},
        });
        setMessage({ tone: "error", text: USER_SAFE.GENERIC_ERROR });
      }
    });
  }

  const heading: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--kt-fg-1)",
    margin: "0 0 12px",
  };
  const meta: React.CSSProperties = { fontSize: 12, color: "var(--kt-fg-3)" };

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--kt-fg-1)", margin: "0 0 4px" }}>
        Model management
      </h1>
      <p style={{ ...meta, margin: "0 0 24px" }}>
        The model each role resolves to, deployment-wide. Discovery proposes
        upgrades daily; you approve them here.
      </p>

      {loadError && (
        <p role="alert" style={{ fontSize: 13, color: "var(--kt-danger)", marginBottom: 16 }}>
          Some model data failed to load. Try refreshing.
        </p>
      )}
      {message && (
        <p
          role="status"
          style={{
            fontSize: 13,
            color: message.tone === "error" ? "var(--kt-danger)" : "var(--kt-success)",
            marginBottom: 16,
          }}
        >
          {message.text}
        </p>
      )}

      {/* Live mapping */}
      <h2 style={heading}>Active models</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
        {assignments.map((a) => (
          <Card key={a.role}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--kt-fg-1)", textTransform: "capitalize" }}>
                    {a.role}
                  </span>
                  <Badge label={a.family} variant="accent" />
                  {a.frozen && <Badge label="frozen" variant="warning" />}
                  <Pill tone="neutral">{a.source}</Pill>
                </div>
                <div style={{ fontSize: 14, fontFamily: "var(--font-mono), monospace", color: "var(--kt-fg-1)" }}>
                  {a.assigned_model_id}
                </div>
                <div style={{ ...meta, marginTop: 4 }}>{ROLE_BLURB[a.role]}</div>
                <div style={{ ...meta, marginTop: 2 }}>updated {fmt(a.updated_at)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pendingAction}
                  onClick={() => run(() => setFrozenAction(a.role, !a.frozen), a.frozen ? "Unfrozen" : "Frozen")}
                >
                  {a.frozen ? "Unfreeze" : "Freeze"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingAction}
                  onClick={() => {
                    setOverriding(overriding === a.role ? null : a.role);
                    setOverrideId(a.assigned_model_id);
                  }}
                >
                  Override
                </Button>
              </div>
            </div>
            {overriding === a.role && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <Input
                    style={{ width: "100%", fontFamily: "var(--font-mono), monospace" }}
                    value={overrideId}
                    onChange={(e) => setOverrideId(e.target.value)}
                    placeholder={`${a.family} model id`}
                    aria-label={`Override model for ${a.role}`}
                  />
                </div>
                <Button
                  variant="accent"
                  size="sm"
                  loading={pendingAction}
                  disabled={!overrideId.trim() || overrideId.trim() === a.assigned_model_id}
                  onClick={() => run(() => overrideModelAction(a.role, overrideId, a.family), "Model overridden")}
                >
                  Apply
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Pending proposals */}
      <h2 style={heading}>Pending upgrades</h2>
      {pending.length === 0 ? (
        <div style={{ marginBottom: 32 }}>
          <EmptyState title="No pending upgrades" body="Discovery proposes a flip when a newer model ships in a role's family." />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {pending.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--kt-fg-1)", textTransform: "capitalize" }}>
                      {p.role}
                    </span>
                    <Badge label={p.family} variant="accent" />
                  </div>
                  <div style={{ fontSize: 13, fontFamily: "var(--font-mono), monospace", color: "var(--kt-fg-2)" }}>
                    {p.from_model} → <span style={{ color: "var(--kt-fg-1)", fontWeight: 600 }}>{p.to_model}</span>
                  </div>
                  <div style={{ ...meta, marginTop: 4 }}>
                    {p.released_at ? `released ${fmt(p.released_at).split(",")[0]}` : "release date unknown"} · cost impact unconfirmed — verify pricing
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <Button
                    variant="accent"
                    size="sm"
                    loading={pendingAction}
                    onClick={() => run(() => approveFlipAction(p.id), `${p.role} now uses ${p.to_model}`)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pendingAction}
                    onClick={() => {
                      setRejecting(rejecting === p.id ? null : p.id);
                      setRejectReason("");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
              {rejecting === p.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      style={{ width: "100%" }}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason (optional) — recorded + 14-day cooldown"
                      aria-label="Rejection reason"
                    />
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={pendingAction}
                    onClick={() => run(() => rejectFlipAction(p.id, rejectReason.trim() || null), "Proposal rejected")}
                  >
                    Confirm reject
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* History */}
      <h2 style={heading}>Recent decisions</h2>
      {history.length === 0 ? (
        <EmptyState title="No history yet" body="Approved and rejected proposals appear here." />
      ) : (
        <Card variant="muted">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <Badge
                  label={h.status ?? "—"}
                  variant={h.status === "approved" ? "success" : "default"}
                />
                <span style={{ textTransform: "capitalize", color: "var(--kt-fg-2)" }}>{h.role}</span>
                <span style={{ fontFamily: "var(--font-mono), monospace", color: "var(--kt-fg-2)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  → {h.to_model}
                </span>
                <span style={meta}>{fmt(h.decided_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
