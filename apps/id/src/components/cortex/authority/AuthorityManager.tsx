"use client";

/**
 * AuthorityManager renders the four sections of the Cortex Authority
 * sub-tab per the Kinetiks Contract Addendum §2.13:
 *
 *   - Active permissions  — grants the system is currently operating under
 *   - Paused permissions  — grants the customer has temporarily halted
 *   - Proposed permissions — grants the customer hasn't decided on yet,
 *                            deep-linking back to the Approvals tab
 *   - Recent activity     — last 7 days of aggregated usage_summary
 *
 * Per CLAUDE.md the literal phrase "Authority Grant" never appears in
 * customer copy here. The framing is "permission" + the grant's
 * `scope_description`.
 *
 * Receives initial data from the parent Server Component
 * (apps/id/src/app/(app)/cortex/authority/page.tsx) — no client-side
 * data fetching on first paint. Server Actions invalidate the route on
 * mutation, so the page refetches naturally.
 *
 * Phase 4 — Chunk 8.
 */

import type { AuthorityGrant } from "@kinetiks/types";

import { AuthorityGrantCard } from "./AuthorityGrantCard";

interface RecentActivityEntry {
  event_type: string;
  grant_id: string | null;
  created_at: string;
  detail: Record<string, unknown>;
  /** Resolved from the grant's scope_description; null if grant was deleted. */
  scope_description: string | null;
}

interface AuthorityManagerProps {
  grants: AuthorityGrant[];
  recentActivity: RecentActivityEntry[];
  systemName: string | null;
}

export function AuthorityManager({
  grants,
  recentActivity,
  systemName,
}: AuthorityManagerProps) {
  const active = grants.filter((g) => g.status === "active");
  const paused = grants.filter((g) => g.status === "paused");
  const proposed = grants.filter((g) => g.status === "proposed");

  const totalReviewable = active.length + paused.length + proposed.length;

  if (totalReviewable === 0 && recentActivity.length === 0) {
    return <EmptyState systemName={systemName} />;
  }

  return (
    <div>
      {/* Proposed (review first — there is an outstanding decision) */}
      {proposed.length > 0 && (
        <Section
          title={`Awaiting your review (${proposed.length})`}
          description="Proposed permissions live in the Approvals queue. Click through to approve, edit, or decline."
        >
          {proposed.map((g) => (
            <ProposedTeaser key={g.id} grant={g} systemName={systemName} />
          ))}
        </Section>
      )}

      {/* Active */}
      <Section
        title={`Active (${active.length})`}
        description={
          active.length === 0
            ? `${systemName ?? "Your system"} isn't operating under any permissions right now.`
            : `Permissions ${systemName ?? "your system"} can act on without checking with you.`
        }
      >
        {active.map((g) => (
          <AuthorityGrantCard
            key={g.id}
            grant={g}
            systemName={systemName}
          />
        ))}
      </Section>

      {/* Paused */}
      {paused.length > 0 && (
        <Section
          title={`Paused (${paused.length})`}
          description={`Permissions you've temporarily halted. Resume to let ${
            systemName ?? "your system"
          } act on them again.`}
        >
          {paused.map((g) => (
            <AuthorityGrantCard
              key={g.id}
              grant={g}
              systemName={systemName}
            />
          ))}
        </Section>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <Section
          title="Recent activity"
          description="Lifecycle events on your permissions in the last 7 days."
        >
          <RecentActivityList entries={recentActivity} />
        </Section>
      )}
    </div>
  );
}

// ============================================================
// Sections
// ============================================================

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "var(--kt-s-6)" }}>
      <h2
        style={{
          fontSize: "var(--kt-fs-17)",
          fontWeight: "var(--kt-fw-semi)",
          color: "var(--kt-fg-1)",
          margin: "0 0 var(--kt-s-1)",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: "var(--kt-fs-13)",
          color: "var(--kt-fg-3)",
          margin: "0 0 var(--kt-s-3)",
          lineHeight: "var(--kt-lh-body)",
        }}
      >
        {description}
      </p>
      {children}
    </section>
  );
}

function EmptyState({ systemName }: { systemName: string | null }) {
  return (
    <div
      style={{
        padding: "var(--kt-s-5)",
        borderRadius: "var(--kt-radius-2)",
        border: "1px solid var(--kt-border-2)",
        background: "var(--kt-bg-subtle)",
        maxWidth: 720,
      }}
    >
      <h2
        style={{
          fontSize: "var(--kt-fs-17)",
          fontWeight: "var(--kt-fw-semi)",
          color: "var(--kt-fg-1)",
          margin: "0 0 var(--kt-s-2)",
        }}
      >
        No permissions yet
      </h2>
      <p
        style={{
          fontSize: "var(--kt-fs-14)",
          lineHeight: "var(--kt-lh-body)",
          color: "var(--kt-fg-2)",
          margin: "0 0 var(--kt-s-3)",
        }}
      >
        {systemName ?? "Your system"} hasn&apos;t asked for any permissions yet.
        When it does, you&apos;ll see each proposal in the Approvals queue with
        a plain-language description of what it would do, what limits would
        apply, and what would cause it to check with you first.
      </p>
      <p
        style={{
          fontSize: "var(--kt-fs-14)",
          lineHeight: "var(--kt-lh-body)",
          color: "var(--kt-fg-2)",
          margin: 0,
        }}
      >
        You can pause, narrow, or revoke any permission at any moment.
      </p>
    </div>
  );
}

// ============================================================
// Proposed teaser (deep-links to Approvals)
// ============================================================

function ProposedTeaser({
  grant,
  systemName,
}: {
  grant: AuthorityGrant;
  systemName: string | null;
}) {
  return (
    <article
      style={{
        padding: "var(--kt-s-3) var(--kt-s-4)",
        borderRadius: "var(--kt-radius-2)",
        border: "1px solid var(--kt-accent-soft)",
        background: "var(--kt-bg-muted)",
        marginBottom: "var(--kt-s-3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--kt-s-3)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--kt-fs-11)",
            color: "var(--kt-accent)",
            textTransform: "uppercase",
            letterSpacing: "var(--kt-tr-eyebrow)",
            marginBottom: "var(--kt-s-1)",
          }}
        >
          Proposed by {systemName ?? "your system"}
        </div>
        <div
          style={{
            fontSize: "var(--kt-fs-14)",
            fontWeight: "var(--kt-fw-semi)",
            color: "var(--kt-fg-1)",
            marginBottom: "var(--kt-s-1)",
          }}
        >
          {grant.scope_description}
        </div>
        <div
          style={{
            fontSize: "var(--kt-fs-12)",
            color: "var(--kt-fg-3)",
          }}
        >
          {grant.granted_capabilities.length} permission
          {grant.granted_capabilities.length === 1 ? "" : "s"} to review
        </div>
      </div>
      <a
        href="/?tab=approvals"
        style={{
          padding: "var(--kt-s-2) var(--kt-s-3)",
          borderRadius: "var(--kt-radius-1)",
          background: "var(--kt-accent)",
          color: "var(--kt-fg-inverse, white)",
          fontSize: "var(--kt-fs-12)",
          fontWeight: "var(--kt-fw-semi)",
          textDecoration: "none",
          flexShrink: 0,
        }}
      >
        Review in Approvals
      </a>
    </article>
  );
}

// ============================================================
// Recent activity list
// ============================================================

function RecentActivityList({ entries }: { entries: RecentActivityEntry[] }) {
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        border: "1px solid var(--kt-border-2)",
        borderRadius: "var(--kt-radius-2)",
        overflow: "hidden",
      }}
    >
      {entries.map((entry, i) => (
        <li
          // Identity-preserving composite key — grant_id + created_at +
          // event_type uniquely identifies a Ledger row. Avoiding the
          // array index means React keeps the right DOM nodes attached
          // to the right rows if the feed reorders (e.g. on optimistic
          // update or realtime push).
          key={`${entry.grant_id ?? "system"}|${entry.created_at}|${entry.event_type}`}
          style={{
            padding: "var(--kt-s-2) var(--kt-s-3)",
            borderTop: i === 0 ? "none" : "1px solid var(--kt-border-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "var(--kt-s-2)",
            fontSize: "var(--kt-fs-13)",
            color: "var(--kt-fg-2)",
            background: "var(--kt-bg-base)",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ color: "var(--kt-fg-1)" }}>
              {summarizeEvent(entry.event_type)}
            </strong>
            {entry.scope_description && (
              <>
                {": "}
                <span style={{ color: "var(--kt-fg-2)" }}>
                  {entry.scope_description}
                </span>
              </>
            )}
            {entry.event_type === "authority_action_taken" && (
              <ActionTakenSummary detail={entry.detail} />
            )}
          </span>
          <time
            dateTime={entry.created_at}
            style={{
              fontSize: "var(--kt-fs-11)",
              color: "var(--kt-fg-3)",
              flexShrink: 0,
            }}
          >
            {relativeTime(entry.created_at)}
          </time>
        </li>
      ))}
    </ul>
  );
}

function ActionTakenSummary({ detail }: { detail: Record<string, unknown> }) {
  const tool = typeof detail.tool_name === "string" ? detail.tool_name : null;
  if (!tool) return null;
  return (
    <span style={{ marginLeft: "var(--kt-s-1)", color: "var(--kt-fg-3)" }}>
      {`(${prettyToolName(tool)})`}
    </span>
  );
}

function prettyToolName(toolName: string): string {
  return toolName
    .replace(/^kinetiks_id\./, "")
    .replace(/_/g, " ");
}

function summarizeEvent(eventType: string): string {
  switch (eventType) {
    case "authority_grant_proposed":
      return "Permission proposed";
    case "authority_grant_approved":
      return "Permission approved";
    case "authority_grant_paused":
      return "Permission paused";
    case "authority_grant_resumed":
      return "Permission resumed";
    case "authority_grant_narrowed":
      return "Permission narrowed";
    case "authority_grant_revoked":
      return "Permission revoked";
    case "authority_grant_expired":
      return "Permission expired";
    case "authority_action_taken":
      return "Action taken";
    case "authority_action_escalated":
      return "Checked with you";
    default:
      return eventType;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
